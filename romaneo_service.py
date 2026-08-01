from collections import defaultdict
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models


TIPOS_SALIDA = ("Media", "Pierna", "Espalda", "Rueda", "Completo", "Vacio")
TIPOS_PIERNA = {"Pierna", "Rueda"}
TIPOS_ESPALDA = {"Espalda", "Completo", "Vacio"}

# Punto 1 Critico No prioritario: en las pantallas de prestamos, Ganadera y Hacienda
# de Raza se muestran como una sola parte frente a Erre de Mayoristas (y viceversa).
FIRMAS_UNIFICADAS_PRESTAMO = ("Ganadera Roberto Graziotin S.A.", "Hacienda de Raza S.A.")
CONTRAPARTE_UNIFICACION_PRESTAMO = "Erre de Mayoristas S.A."
NOMBRE_UNIFICADO_PRESTAMO = " + ".join(FIRMAS_UNIFICADAS_PRESTAMO)


def normalizar_nombre(valor):
    return " ".join((valor or "").strip().lower().split())


def es_prestamo(origen, destino):
    return bool(origen and destino and normalizar_nombre(origen) != normalizar_nombre(destino))


def _nombre_prestamo_unificado(nombre, contraparte):
    firmas_normalizadas = {normalizar_nombre(firma) for firma in FIRMAS_UNIFICADAS_PRESTAMO}
    if (
        normalizar_nombre(contraparte) == normalizar_nombre(CONTRAPARTE_UNIFICACION_PRESTAMO)
        and normalizar_nombre(nombre) in firmas_normalizadas
    ):
        return NOMBRE_UNIFICADO_PRESTAMO
    return nombre


def asegurar_cliente(db: Session, nombre: str, razon_social=None):
    nombre = (nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El cliente es obligatorio.")

    existente = db.query(models.Cliente).filter(models.Cliente.nombre.ilike(nombre)).first()
    if not existente:
        existente = models.Cliente(nombre=nombre, razon_social=razon_social)
        db.add(existente)
    return existente


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
        existente = models.FirmaConsignataria(nombre=nombre, es_propia=es_propia)
        db.add(existente)
    return existente


def peso_real_salida(salida: models.Salida):
    """For a whole half-carcass, camera weight is the actual delivered weight."""
    pieza = salida.pieza
    if salida.tipo == "Media" and pieza and pieza.peso_salida_camara_kg is not None:
        return float(pieza.peso_salida_camara_kg)
    return float(salida.peso_kg)


# La media entra como una sola pieza pesada en caliente: no hay un peso de
# entrada separado por corte, asi que estimamos la porcion caliente de cada
# tipo con la proporcion pierna/espalda de una media (el delantero, donde
# va la espalda, pesa mas que el trasero, donde va la pierna).
RATIO_CALIENTE_POR_TIPO = {
    "Pierna": 0.45,
    "Rueda": 0.45,
    "Espalda": 0.55,
    "Completo": 0.55,
    "Vacio": 0.55,
}


def kg_caliente_estimado(pieza: models.Pieza, tipo: str):
    if pieza is None or pieza.peso_entrada_kg is None:
        return None
    ratio = RATIO_CALIENTE_POR_TIPO.get(tipo, 1.0)
    return round(float(pieza.peso_entrada_kg) * ratio, 2)


def merma_item_pct(kg_caliente, kg_frio):
    if kg_caliente is None or kg_frio is None or kg_caliente <= 0:
        return None
    return round((kg_caliente - kg_frio) / kg_caliente * 100, 2)


def salida_dict(salida: models.Salida):
    pieza = salida.pieza
    tropa = pieza.tropa if pieza else None
    kg_frio = peso_real_salida(salida)
    kg_caliente = kg_caliente_estimado(pieza, salida.tipo)

    return {
        "id": salida.id,
        "pieza_id": salida.pieza_id,
        "tipo": salida.tipo,
        "peso_kg": kg_frio,
        "peso_registrado_kg": float(salida.peso_kg),
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
        "campo": tropa.proveedor.nombre if tropa and tropa.proveedor else None,
        "kg_caliente_estimado": kg_caliente,
        "merma_pct": merma_item_pct(kg_caliente, kg_frio),
    }


def peso_base_pieza(pieza: models.Pieza):
    return float(pieza.peso_salida_camara_kg or pieza.peso_entrada_kg or 0)


def total_salidas(pieza: models.Pieza, excluir_salida_id=None):
    return round(sum(
        peso_real_salida(salida)
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

    # Alerta especifica para merma entre Pierna + Espalda vs Media de camara
    tipos_en_salidas = {s.tipo for s in pieza.salidas}
    if "Pierna" in tipos_en_salidas and "Espalda" in tipos_en_salidas:
        if diferencia > 2.0:
            return (
                f"ALERTAR: La suma de pierna y espalda ({total:.2f} kg) difiere en "
                f"{diferencia:.2f} kg del peso de salida de media ({base:.2f} kg)."
            )

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
            peso_real = peso_real_salida(salida)
            pieza.en_stock_pierna = False
            pieza.destino_pierna = salida.cliente
            pieza.fecha_salida_pierna = salida.fecha_salida
            pieza.peso_salida_pierna_kg = peso_real * 0.45
            pieza.en_stock_espalda = False
            pieza.destino_espalda = salida.cliente
            pieza.fecha_salida_espalda = salida.fecha_salida
            pieza.peso_salida_espalda_kg = peso_real * 0.55
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

    if tipo == "Media":
        peso_kg = float(pieza.peso_salida_camara_kg)

    if tipo == "Media" and pieza.salidas:
        raise HTTPException(status_code=400, detail="No se puede sacar una media completa porque ya tiene salidas parciales.")

    cliente = (cliente or "").strip()
    razon_social_destino = (razon_social_destino or "").strip()
    firma_destino = asegurar_firma(db, razon_social_destino)
    asegurar_cliente(db, cliente, firma_destino)

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
        "kilos_toro": 0.0,
        "kilos_nov_vaq": 0.0,
        "items": defaultdict(int),
    })
    for salida in salidas:
        if not es_prestamo(salida.razon_social_origen, salida.razon_social_destino):
            continue
        origen = _nombre_prestamo_unificado(salida.razon_social_origen, salida.razon_social_destino)
        destino = _nombre_prestamo_unificado(salida.razon_social_destino, salida.razon_social_origen)
        clave = (origen, destino)
        grupo = grupos[clave]
        grupo["razon_social_origen"] = origen
        grupo["razon_social_destino"] = destino
        grupo["movimientos"] += 1
        peso = peso_real_salida(salida)
        grupo["kilos"] += peso

        es_toro = bool(salida.pieza and salida.pieza.es_toro)
        if es_toro:
            grupo["kilos_toro"] += peso
        else:
            grupo["kilos_nov_vaq"] += peso

        tipo_display = f"{salida.tipo} (Toro)" if es_toro else salida.tipo
        grupo["items"][tipo_display] += 1

    resultado = []
    for grupo in grupos.values():
        grupo["kilos"] = round(grupo["kilos"], 2)
        grupo["kilos_toro"] = round(grupo["kilos_toro"], 2)
        grupo["kilos_nov_vaq"] = round(grupo["kilos_nov_vaq"], 2)
        grupo["items"] = dict(sorted(grupo["items"].items()))
        resultado.append(grupo)
    return sorted(resultado, key=lambda grupo: (
        normalizar_nombre(grupo["razon_social_origen"]),
        normalizar_nombre(grupo["razon_social_destino"]),
    ))


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
