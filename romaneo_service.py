from collections import defaultdict
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models


TIPOS_SALIDA = ("Media", "Pierna", "Espalda", "Rueda", "Completo", "Vacio")
TIPOS_PIERNA = {"Pierna", "Rueda"}
TIPOS_ESPALDA = {"Espalda", "Completo", "Vacio"}


def normalizar_nombre(valor):
    return " ".join((valor or "").strip().lower().split())


def es_prestamo(origen, destino):
    return bool(origen and destino and normalizar_nombre(origen) != normalizar_nombre(destino))


def asegurar_cliente(db: Session, nombre: str):
    nombre = (nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El cliente es obligatorio.")

    existente = db.query(models.Cliente).filter(models.Cliente.nombre.ilike(nombre)).first()
    if not existente:
        db.add(models.Cliente(nombre=nombre))


def asegurar_firma(db: Session, nombre: str, es_propia: bool = False):
    nombre = (nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="La razon social es obligatoria.")

    existente = (
        db.query(models.FirmaConsignataria)
        .filter(models.FirmaConsignataria.nombre.ilike(nombre))
        .first()
    )
    if not existente:
        db.add(models.FirmaConsignataria(nombre=nombre, es_propia=es_propia))


def salida_dict(salida: models.Salida):
    pieza = salida.pieza
    tropa = pieza.tropa if pieza else None
    return {
        "id": salida.id,
        "pieza_id": salida.pieza_id,
        "tipo": salida.tipo,
        "peso_kg": float(salida.peso_kg),
        "cliente": salida.cliente,
        "razon_social_origen": salida.razon_social_origen,
        "razon_social_destino": salida.razon_social_destino,
        "es_prestamo": es_prestamo(salida.razon_social_origen, salida.razon_social_destino),
        "fecha_salida": salida.fecha_salida.isoformat(),
        "cierra_pieza": salida.cierra_pieza,
        "observaciones": salida.observaciones,
        "numero_pieza": pieza.numero_pieza if pieza else None,
        "numero_tropa": tropa.numero_tropa if tropa else None,
        "matadero": tropa.matadero if tropa else None,
        "firma": tropa.firma if tropa else None,
        "es_toro": bool(pieza.es_toro) if pieza else False,
    }


def peso_base_pieza(pieza: models.Pieza):
    return float(pieza.peso_salida_camara_kg or pieza.peso_entrada_kg or 0)


def total_salidas(pieza: models.Pieza, excluir_salida_id=None):
    return round(sum(
        float(salida.peso_kg)
        for salida in pieza.salidas
        if salida.id != excluir_salida_id
    ), 2)


def saldo_pieza(pieza: models.Pieza):
    return round(max(0.0, peso_base_pieza(pieza) - total_salidas(pieza)), 2)


def advertencia_balance(pieza: models.Pieza):
    if pieza.peso_salida_camara_kg is None:
        return None

    base = float(pieza.peso_salida_camara_kg)
    total = total_salidas(pieza)
    diferencia = abs(base - total)
    if diferencia <= 0.5:
        return None

    sentido = "faltan" if total < base else "sobran"
    return (
        f"Advertencia: las salidas suman {total:.2f} kg y la media de camara "
        f"{base:.2f} kg; {sentido} {diferencia:.2f} kg."
    )


def recalcular_estado_pieza(pieza: models.Pieza):
    pieza.en_stock_pierna = True
    pieza.destino_pierna = None
    pieza.fecha_salida_pierna = None
    pieza.peso_salida_pierna_kg = None
    pieza.en_stock_espalda = True
    pieza.destino_espalda = None
    pieza.fecha_salida_espalda = None
    pieza.peso_salida_espalda_kg = None
    pieza.cerrada = False

    salidas = sorted(pieza.salidas, key=lambda salida: (salida.fecha_salida, salida.id or 0))
    for salida in salidas:
        if salida.tipo == "Media":
            pieza.en_stock_pierna = False
            pieza.destino_pierna = salida.cliente
            pieza.fecha_salida_pierna = salida.fecha_salida
            pieza.peso_salida_pierna_kg = float(salida.peso_kg) * 0.55
            pieza.en_stock_espalda = False
            pieza.destino_espalda = salida.cliente
            pieza.fecha_salida_espalda = salida.fecha_salida
            pieza.peso_salida_espalda_kg = float(salida.peso_kg) * 0.45
        elif salida.tipo in TIPOS_PIERNA:
            pieza.en_stock_pierna = False
            pieza.destino_pierna = salida.cliente
            pieza.fecha_salida_pierna = salida.fecha_salida
            pieza.peso_salida_pierna_kg = salida.peso_kg
        elif salida.tipo == "Espalda":
            pieza.en_stock_espalda = False
            pieza.destino_espalda = salida.cliente
            pieza.fecha_salida_espalda = salida.fecha_salida
            pieza.peso_salida_espalda_kg = salida.peso_kg

        if salida.cierra_pieza:
            pieza.cerrada = True

    if pieza.peso_salida_camara_kg is not None and saldo_pieza(pieza) <= 0.5 and salidas:
        pieza.cerrada = True
        salidas[-1].cierra_pieza = True

    if pieza.cerrada:
        pieza.en_stock_pierna = False
        pieza.en_stock_espalda = False


def crear_salida(
    db: Session,
    pieza: models.Pieza,
    *,
    tipo: str,
    peso_kg: float,
    cliente: str,
    razon_social_destino: str,
    fecha_salida=None,
    peso_salida_camara_kg=None,
    cierra_pieza=False,
    observaciones=None,
):
    if tipo not in TIPOS_SALIDA:
        raise HTTPException(status_code=400, detail=f"Tipo de salida invalido: {tipo}.")
    if peso_kg is None or float(peso_kg) <= 0:
        raise HTTPException(status_code=400, detail="El peso de salida debe ser mayor que 0.")
    if pieza.cerrada:
        raise HTTPException(status_code=400, detail="La media ya esta cerrada. Edite o borre una salida existente para reabrirla.")

    if pieza.peso_salida_camara_kg is None:
        if peso_salida_camara_kg is None:
            raise HTTPException(status_code=400, detail="La primera salida requiere el peso de camara de la media.")
        if float(peso_salida_camara_kg) > float(pieza.peso_entrada_kg) + 0.5:
            raise HTTPException(status_code=400, detail="El peso de camara no puede superar el peso de entrada.")
        pieza.peso_salida_camara_kg = float(peso_salida_camara_kg)

    if tipo == "Media" and pieza.salidas:
        raise HTTPException(status_code=400, detail="No se puede sacar una media completa porque ya tiene salidas parciales.")

    cliente = (cliente or "").strip()
    razon_social_destino = (razon_social_destino or "").strip()
    asegurar_cliente(db, cliente)
    asegurar_firma(db, razon_social_destino)

    origen = pieza.tropa.firma if pieza.tropa and pieza.tropa.firma else "Sin firma"
    salida = models.Salida(
        pieza=pieza,
        tipo=tipo,
        peso_kg=float(peso_kg),
        cliente=cliente,
        razon_social_origen=origen,
        razon_social_destino=razon_social_destino,
        fecha_salida=fecha_salida or datetime.utcnow(),
        cierra_pieza=bool(cierra_pieza or tipo == "Media"),
        observaciones=(observaciones or "").strip() or None,
    )
    db.add(salida)
    db.flush()
    recalcular_estado_pieza(pieza)
    return salida, advertencia_balance(pieza)


def clave_resumen(tipo: str, es_toro: bool):
    if tipo == "Media":
        return "media_toro" if es_toro else "medias"
    if tipo == "Espalda":
        return "espaldas_toro" if es_toro else "espaldas"
    if tipo == "Pierna":
        return "piernas_toro" if es_toro else "piernas"
    if tipo == "Rueda":
        return "rueda"
    if tipo == "Completo":
        return "completos"
    if tipo == "Vacio":
        return "vacios"
    return "otros"


def nueva_fila_cliente(cliente: str):
    fila = {"cliente": cliente, "registros": 0, "kilos": 0.0}
    for clave in (
        "medias", "espaldas", "piernas", "rueda", "media_toro",
        "espaldas_toro", "piernas_toro", "completos", "vacios", "otros",
    ):
        fila[clave] = 0
        fila[f"{clave}_kg"] = 0.0
    return fila


def agrupar_prestamos(salidas):
    grupos = defaultdict(lambda: {
        "razon_social_origen": "",
        "razon_social_destino": "",
        "movimientos": 0,
        "kilos": 0.0,
        "items": defaultdict(int),
    })
    for salida in salidas:
        if not es_prestamo(salida.razon_social_origen, salida.razon_social_destino):
            continue
        clave = (salida.razon_social_origen, salida.razon_social_destino)
        grupo = grupos[clave]
        grupo["razon_social_origen"] = salida.razon_social_origen
        grupo["razon_social_destino"] = salida.razon_social_destino
        grupo["movimientos"] += 1
        grupo["kilos"] += float(salida.peso_kg)
        grupo["items"][salida.tipo] += 1

    resultado = []
    for grupo in grupos.values():
        grupo["kilos"] = round(grupo["kilos"], 2)
        grupo["items"] = dict(sorted(grupo["items"].items()))
        resultado.append(grupo)
    return sorted(resultado, key=lambda grupo: grupo["kilos"], reverse=True)


def clasificar_existencia(pieza: models.Pieza, salidas_hasta_fecha):
    if any(salida.cierra_pieza for salida in salidas_hasta_fecha):
        return None

    if not salidas_hasta_fecha:
        return "media_toro" if pieza.es_toro else "medias"

    tipos = {salida.tipo for salida in salidas_hasta_fecha}
    salio_pierna = bool(tipos & TIPOS_PIERNA)
    salio_espalda = bool(tipos & TIPOS_ESPALDA)

    if salio_pierna and not salio_espalda:
        return "espaldas_toro" if pieza.es_toro else "espaldas"
    if salio_espalda and not salio_pierna:
        return "piernas_toro" if pieza.es_toro else "piernas"

    return "media_toro" if pieza.es_toro else "medias"


def fecha_en_rango(fecha: datetime, desde: date | None, hasta: date | None):
    valor = fecha.date()
    return (not desde or valor >= desde) and (not hasta or valor <= hasta)
