import os
import unittest
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, inspect, text


ROOT = Path(__file__).resolve().parents[1]
TEST_DB = ROOT / ".tmp-romaneo-tests.sqlite"
DATABASE_URL = f"sqlite:///{TEST_DB.as_posix()}"

# Simulate an existing installation whose clients table predates the new relation.
TEST_DB.unlink(missing_ok=True)
legacy_engine = create_engine(DATABASE_URL)
with legacy_engine.begin() as connection:
    connection.execute(text(
        "CREATE TABLE clientes ("
        "id INTEGER PRIMARY KEY, "
        "nombre VARCHAR NOT NULL UNIQUE"
        ")"
    ))
legacy_engine.dispose()

os.environ["DATABASE_URL"] = DATABASE_URL

import models  # noqa: E402
import schemas  # noqa: E402
from database import SessionLocal, engine  # noqa: E402
from main import (  # noqa: E402
    actualizar_cliente,
    actualizar_salida,
    cargar_pieza,
    crear_cliente,
    crear_firma,
    crear_tropa,
    listar_clientes,
    registrar_salida,
    resumen_salidas,
    verificar_pieza_salida,
)
from romaneo_service import agrupar_prestamos  # noqa: E402


class ImprovementsIntegrationTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        TEST_DB.unlink(missing_ok=True)

    def test_01_legacy_client_table_receives_social_entity_column(self):
        columns = {column["name"] for column in inspect(engine).get_columns("clientes")}
        self.assertIn("razon_social_id", columns)

    def test_02_client_relation_is_returned_and_can_be_changed(self):
        db = SessionLocal()
        try:
            firm_a = crear_firma(schemas.FirmaCreate(nombre="Firma Cliente A"), db)
            firm_b = crear_firma(schemas.FirmaCreate(nombre="Firma Cliente B"), db)
            customer = crear_cliente(schemas.ClienteCreate(
                nombre="Cliente Catalogado",
                razon_social_id=firm_a.id,
            ), db)
            serialized = schemas.Cliente.model_validate(customer)
            self.assertEqual(serialized.razon_social.nombre, "Firma Cliente A")

            customer = actualizar_cliente(customer.id, schemas.ClienteCreate(
                nombre=customer.nombre,
                razon_social_id=firm_b.id,
            ), db)
            serialized = schemas.Cliente.model_validate(customer)
            self.assertEqual(serialized.razon_social.nombre, "Firma Cliente B")
        finally:
            db.close()

    def test_03_whole_half_uses_real_camera_weight_in_every_report(self):
        db = SessionLocal()
        try:
            troop = crear_tropa(schemas.TropaCreate(
                numero_tropa="TEST-KILOS-1",
                matadero="Vildoza",
                firma="Firma Origen Test",
            ), db)
            piece = cargar_pieza(troop.id, schemas.PiezaCreate(
                numero_pieza=101,
                peso_entrada_kg=125,
            ), db)
            result = registrar_salida(schemas.SalidaCreate(
                pieza_id=piece.id,
                tipo="Media",
                peso_kg=123,
                peso_salida_camara_kg=120,
                cliente="Cliente Salida Test",
                razon_social_destino="Firma Destino Test",
                fecha_salida=datetime(2026, 7, 20, 12),
            ), db)
            exit_id = result["salida"]["id"]
            self.assertEqual(result["salida"]["peso_kg"], 120)

            # Reproduce the historical inconsistency: the exit row says 123 kg,
            # while the actual camera weight of the delivered half is 120 kg.
            saved_exit = db.get(models.Salida, exit_id)
            saved_exit.peso_kg = 123
            db.commit()

            summary = resumen_salidas(date(2026, 7, 20), date(2026, 7, 20), None, db)
            self.assertEqual(summary["resumen"]["kilos_totales"], 120)
            self.assertEqual(summary["por_cliente"][0]["medias_kg"], 120)
            self.assertEqual(summary["detalle"][0]["peso_kg"], 120)
            self.assertEqual(summary["resumen"]["kilos_prestados"], 120)

            updated = actualizar_salida(exit_id, schemas.SalidaUpdate(
                peso_kg=118.5,
                razon_social_destino="Firma Destino Editada",
            ), db)
            self.assertEqual(updated["salida"]["peso_kg"], 118.5)
            self.assertEqual(updated["salida"]["razon_social_destino"], "Firma Destino Editada")

            status = verificar_pieza_salida(troop.id, 101, db)
            self.assertEqual(status["peso_salida_camara_kg"], 118.5)
            self.assertEqual(status["saldo_kg"], 0)

            customers = listar_clientes(db)
            auto_customer = next(item for item in customers if item.nombre == "Cliente Salida Test")
            self.assertEqual(auto_customer.razon_social.nombre, "Firma Destino Test")
        finally:
            db.close()

    def test_04_loans_are_ordered_by_origin_then_destination(self):
        piece = SimpleNamespace(peso_salida_camara_kg=None)
        exits = [
            SimpleNamespace(
                pieza=piece,
                tipo="Pierna",
                peso_kg=20,
                razon_social_origen="Ganadera",
                razon_social_destino="Tiento",
            ),
            SimpleNamespace(
                pieza=piece,
                tipo="Espalda",
                peso_kg=10,
                razon_social_origen="Erre de",
                razon_social_destino="Rizzo",
            ),
            SimpleNamespace(
                pieza=piece,
                tipo="Pierna",
                peso_kg=15,
                razon_social_origen="Erre de",
                razon_social_destino="Alessandra",
            ),
        ]

        groups = agrupar_prestamos(exits)
        self.assertEqual(
            [(group["razon_social_origen"], group["razon_social_destino"]) for group in groups],
            [("Erre de", "Alessandra"), ("Erre de", "Rizzo"), ("Ganadera", "Tiento")],
        )


if __name__ == "__main__":
    unittest.main()
