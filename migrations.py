from datetime import datetime

from sqlalchemy import inspect, or_, text
from sqlalchemy.orm import joinedload

import models
from database import SessionLocal, engine


FIRMAS_INICIALES = [
    ("Erre de Mayoristas S.A.", True),
    ("Ganadera Roberto Graziotin S.A.", True),
    ("Hacienda de Raza S.A.", True),
    ("Razas de altura S.A.", False),
]


def _agregar_columnas_piezas():
    dialecto = engine.dialect.name

    if dialecto == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE piezas ADD COLUMN IF NOT EXISTS es_toro BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE piezas ADD COLUMN IF NOT EXISTS cerrada BOOLEAN NOT NULL DEFAULT FALSE"))
        return

    columnas = {columna["name"] for columna in inspect(engine).get_columns("piezas")}
    with engine.begin() as conn:
        if "es_toro" not in columnas:
            conn.execute(text("ALTER TABLE piezas ADD COLUMN es_toro BOOLEAN NOT NULL DEFAULT 0"))
        if "cerrada" not in columnas:
            conn.execute(text("ALTER TABLE piezas ADD COLUMN cerrada BOOLEAN NOT NULL DEFAULT 0"))


def _sembrar_firmas(db):
    firmas = {nombre: es_propia for nombre, es_propia in FIRMAS_INICIALES}
    for (nombre,) in db.query(models.Tropa.firma).distinct().all():
        if nombre and nombre.strip():
            firmas.setdefault(nombre.strip(), False)

    existentes = {
        firma.nombre.strip().lower(): firma
        for firma in db.query(models.FirmaConsignataria).all()
    }
    for nombre, es_propia in firmas.items():
        clave = nombre.lower()
        if clave not in existentes:
            db.add(models.FirmaConsignataria(nombre=nombre, es_propia=es_propia))
        elif es_propia and not existentes[clave].es_propia:
            existentes[clave].es_propia = True


def _migrar_salidas_legacy(db):
    piezas = (
        db.query(models.Pieza)
        .options(joinedload(models.Pieza.tropa))
        .filter(
            or_(
                models.Pieza.en_stock_pierna.is_(False),
                models.Pieza.en_stock_espalda.is_(False),
            ),
            ~models.Pieza.salidas.any(),
        )
        .all()
    )

    for pieza in piezas:
        pierna_vendida = pieza.en_stock_pierna is False
        espalda_vendida = pieza.en_stock_espalda is False
        if not pierna_vendida and not espalda_vendida:
            pieza.cerrada = False
            continue

        origen = pieza.tropa.firma if pieza.tropa and pieza.tropa.firma else "Sin firma"
        fecha_base = pieza.tropa.fecha_ingreso if pieza.tropa else datetime.utcnow()
        misma_fecha = False
        if pieza.fecha_salida_pierna and pieza.fecha_salida_espalda:
            misma_fecha = abs((pieza.fecha_salida_pierna - pieza.fecha_salida_espalda).total_seconds()) <= 2
        mismo_cliente = (pieza.destino_pierna or "") == (pieza.destino_espalda or "")

        if pierna_vendida and espalda_vendida and misma_fecha and mismo_cliente:
            peso = float(
                pieza.peso_salida_camara_kg
                or (float(pieza.peso_salida_pierna_kg or 0) + float(pieza.peso_salida_espalda_kg or 0))
                or pieza.peso_entrada_kg
            )
            db.add(models.Salida(
                pieza_id=pieza.id,
                tipo="Media",
                peso_kg=peso,
                cliente=pieza.destino_pierna or "Sin cliente",
                razon_social_origen=origen,
                razon_social_destino=origen,
                fecha_salida=pieza.fecha_salida_pierna or fecha_base,
                cierra_pieza=True,
                legacy_clave=f"pieza:{pieza.id}:media",
            ))
        else:
            salidas = []
            if pierna_vendida:
                salidas.append(models.Salida(
                    pieza_id=pieza.id,
                    tipo="Pierna",
                    peso_kg=float(pieza.peso_salida_pierna_kg or 0.01),
                    cliente=pieza.destino_pierna or "Sin cliente",
                    razon_social_origen=origen,
                    razon_social_destino=origen,
                    fecha_salida=pieza.fecha_salida_pierna or fecha_base,
                    legacy_clave=f"pieza:{pieza.id}:pierna",
                ))
            if espalda_vendida:
                salidas.append(models.Salida(
                    pieza_id=pieza.id,
                    tipo="Espalda",
                    peso_kg=float(pieza.peso_salida_espalda_kg or 0.01),
                    cliente=pieza.destino_espalda or "Sin cliente",
                    razon_social_origen=origen,
                    razon_social_destino=origen,
                    fecha_salida=pieza.fecha_salida_espalda or fecha_base,
                    legacy_clave=f"pieza:{pieza.id}:espalda",
                ))

            salidas.sort(key=lambda salida: salida.fecha_salida)
            if pierna_vendida and espalda_vendida and salidas:
                salidas[-1].cierra_pieza = True
            for salida in salidas:
                db.add(salida)

        pieza.cerrada = pierna_vendida and espalda_vendida


def run_migrations():
    _agregar_columnas_piezas()

    db = SessionLocal()
    try:
        if engine.dialect.name == "postgresql":
            # Prevent concurrent serverless cold starts from migrating the same legacy row.
            db.execute(text("SELECT pg_advisory_xact_lock(76120426)"))
        _sembrar_firmas(db)
        _migrar_salidas_legacy(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
