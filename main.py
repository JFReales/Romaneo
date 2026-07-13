import codecs
import csv
import os
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import engine, get_db
from migrations import run_migrations
from romaneo_service import (
    TIPOS_ESPALDA,
    TIPOS_PIERNA,
    advertencia_balance,
    agrupar_prestamos,
    asegurar_cliente,
    asegurar_firma,
    clasificar_existencia,
    clave_resumen,
    crear_salida,
    es_prestamo,
    fecha_en_rango,
    nueva_fila_cliente,
    peso_base_pieza,
    recalcular_estado_pieza,
    saldo_pieza,
    salida_dict,
    total_salidas,
)


models.Base.metadata.create_all(bind=engine)
run_migrations()


app = FastAPI(title="Sistema de Romaneo", redirect_slashes=False, root_path="/api")

allowed_origins_env = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
allow_all_origins = "*" in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else allowed_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validar_rango(fecha_desde, fecha_hasta):
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise HTTPException(status_code=400, detail="La fecha desde no puede ser mayor que la fecha hasta.")


def _query_salidas(db, fecha_desde=None, fecha_hasta=None, cliente=None):
    query = (
        db.query(models.Salida)
        .options(joinedload(models.Salida.pieza).joinedload(models.Pieza.tropa))
    )
    if fecha_desde:
        query = query.filter(models.Salida.fecha_salida >= datetime.combine(fecha_desde, time.min))
    if fecha_hasta:
        query = query.filter(models.Salida.fecha_salida < datetime.combine(fecha_hasta + timedelta(days=1), time.min))
    if cliente and cliente.strip():
        query = query.filter(models.Salida.cliente.ilike(f"%{cliente.strip()}%"))
    return query.order_by(models.Salida.fecha_salida.asc(), models.Salida.id.asc()).all()


def _pieza_dict(pieza):
    salidas = sorted(pieza.salidas, key=lambda salida: (salida.fecha_salida, salida.id))
    return {
        "id": pieza.id,
        "numero_pieza": pieza.numero_pieza,
        "tropa_id": pieza.tropa_id,
        "numero_tropa": pieza.tropa.numero_tropa,
        "matadero": pieza.tropa.matadero,
        "firma": pieza.tropa.firma,
        "peso_entrada_kg": float(pieza.peso_entrada_kg),
        "peso_salida_camara_kg": float(pieza.peso_salida_camara_kg) if pieza.peso_salida_camara_kg is not None else None,
        "saldo_kg": saldo_pieza(pieza),
        "es_toro": bool(pieza.es_toro),
        "cerrada": bool(pieza.cerrada),
        "en_stock_pierna": bool(pieza.en_stock_pierna),
        "en_stock_espalda": bool(pieza.en_stock_espalda),
        "peso_salida_pierna_kg": float(pieza.peso_salida_pierna_kg or 0),
        "peso_salida_espalda_kg": float(pieza.peso_salida_espalda_kg or 0),
        "destino_pierna": pieza.destino_pierna,
        "destino_espalda": pieza.destino_espalda,
        "fecha_salida_pierna": pieza.fecha_salida_pierna.isoformat() if pieza.fecha_salida_pierna else None,
        "fecha_salida_espalda": pieza.fecha_salida_espalda.isoformat() if pieza.fecha_salida_espalda else None,
        "salidas": [salida_dict(salida) for salida in salidas],
    }


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


# --- Tropas ---

@app.post("/tropas/", response_model=schemas.Tropa)
def crear_tropa(tropa: schemas.TropaCreate, db: Session = Depends(get_db)):
    numero = tropa.numero_tropa.strip()
    if db.query(models.Tropa).filter(models.Tropa.numero_tropa == numero).first():
        raise HTTPException(status_code=400, detail=f"El numero de tropa '{numero}' ya esta registrado.")

    asegurar_firma(db, tropa.firma)
    nueva_tropa = models.Tropa(
        numero_tropa=numero,
        matadero=tropa.matadero,
        firma=tropa.firma.strip(),
        proveedor_id=tropa.proveedor_id,
        fecha_ingreso=tropa.fecha_ingreso or datetime.utcnow(),
    )
    db.add(nueva_tropa)
    db.commit()
    db.refresh(nueva_tropa)
    return nueva_tropa


@app.get("/tropas/", response_model=list[schemas.Tropa])
def listar_tropas(db: Session = Depends(get_db)):
    return db.query(models.Tropa).order_by(models.Tropa.fecha_ingreso.desc(), models.Tropa.id.desc()).all()


@app.put("/tropas/{tropa_id}", response_model=schemas.Tropa)
def actualizar_tropa(tropa_id: int, tropa_update: schemas.TropaCreate, db: Session = Depends(get_db)):
    tropa = db.query(models.Tropa).filter(models.Tropa.id == tropa_id).first()
    if not tropa:
        raise HTTPException(status_code=404, detail="Tropa no encontrada.")

    duplicada = db.query(models.Tropa).filter(
        models.Tropa.numero_tropa == tropa_update.numero_tropa.strip(),
        models.Tropa.id != tropa_id,
    ).first()
    if duplicada:
        raise HTTPException(status_code=400, detail="Ese numero de tropa ya esta registrado.")

    asegurar_firma(db, tropa_update.firma)
    tropa.numero_tropa = tropa_update.numero_tropa.strip()
    tropa.matadero = tropa_update.matadero
    tropa.firma = tropa_update.firma.strip()
    tropa.proveedor_id = tropa_update.proveedor_id
    if tropa_update.fecha_ingreso:
        tropa.fecha_ingreso = tropa_update.fecha_ingreso
    db.commit()
    db.refresh(tropa)
    return tropa


# --- Firmas consignatarias ---

@app.get("/firmas/", response_model=list[schemas.Firma])
def listar_firmas(db: Session = Depends(get_db)):
    return db.query(models.FirmaConsignataria).order_by(
        models.FirmaConsignataria.es_propia.desc(),
        models.FirmaConsignataria.nombre.asc(),
    ).all()


@app.post("/firmas/", response_model=schemas.Firma)
def crear_firma(datos: schemas.FirmaCreate, db: Session = Depends(get_db)):
    nombre = datos.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="Ingrese el nombre de la firma.")
    existente = db.query(models.FirmaConsignataria).filter(
        models.FirmaConsignataria.nombre.ilike(nombre)
    ).first()
    if existente:
        return existente

    firma = models.FirmaConsignataria(nombre=nombre, es_propia=datos.es_propia)
    db.add(firma)
    db.commit()
    db.refresh(firma)
    return firma


# --- Piezas ---

@app.get("/tropas/{tropa_id}/piezas/", response_model=list[schemas.Pieza])
def listar_piezas_tropa(tropa_id: int, db: Session = Depends(get_db)):
    return db.query(models.Pieza).filter(
        models.Pieza.tropa_id == tropa_id
    ).order_by(models.Pieza.numero_pieza.asc(), models.Pieza.id.asc()).all()


@app.post("/tropas/{tropa_id}/piezas/", response_model=schemas.Pieza)
def cargar_pieza(tropa_id: int, pieza: schemas.PiezaCreate, db: Session = Depends(get_db)):
    if not db.query(models.Tropa.id).filter(models.Tropa.id == tropa_id).first():
        raise HTTPException(status_code=404, detail="Tropa no encontrada.")

    nueva_pieza = models.Pieza(
        tropa_id=tropa_id,
        numero_pieza=pieza.numero_pieza,
        peso_entrada_kg=pieza.peso_entrada_kg,
        es_toro=pieza.es_toro,
    )
    try:
        db.add(nueva_pieza)
        db.commit()
        db.refresh(nueva_pieza)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"La pieza {pieza.numero_pieza} ya fue cargada.")
    return nueva_pieza


@app.put("/piezas/{pieza_id}", response_model=schemas.Pieza)
def actualizar_pieza(pieza_id: int, datos: schemas.PiezaUpdate, db: Session = Depends(get_db)):
    pieza = db.query(models.Pieza).filter(models.Pieza.id == pieza_id).first()
    if not pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")

    duplicada = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == pieza.tropa_id,
        models.Pieza.numero_pieza == datos.numero_pieza,
        models.Pieza.id != pieza_id,
    ).first()
    if duplicada:
        raise HTTPException(status_code=400, detail=f"La pieza {datos.numero_pieza} ya existe en esta tropa.")

    pieza.numero_pieza = datos.numero_pieza
    pieza.peso_entrada_kg = datos.peso_entrada_kg
    pieza.es_toro = datos.es_toro
    db.commit()
    db.refresh(pieza)
    return pieza


@app.delete("/piezas/{pieza_id}")
def eliminar_pieza(pieza_id: int, db: Session = Depends(get_db)):
    pieza = db.query(models.Pieza).options(joinedload(models.Pieza.salidas)).filter(models.Pieza.id == pieza_id).first()
    if not pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")
    if pieza.salidas:
        raise HTTPException(status_code=400, detail="Primero borre las salidas registradas de esta pieza.")
    db.delete(pieza)
    db.commit()
    return {"mensaje": "Pieza eliminada correctamente."}


@app.delete("/tropas/{tropa_id}/piezas")
@app.delete("/tropas/{tropa_id}/piezas/")
def eliminar_todas_las_piezas_tropa(tropa_id: int, db: Session = Depends(get_db)):
    piezas = db.query(models.Pieza).options(joinedload(models.Pieza.salidas)).filter(
        models.Pieza.tropa_id == tropa_id
    ).all()
    con_salida = [pieza for pieza in piezas if pieza.salidas]
    if con_salida:
        raise HTTPException(
            status_code=400,
            detail=f"Hay {len(con_salida)} piezas con salidas. Borre esos movimientos antes de eliminar todo.",
        )
    eliminadas = len(piezas)
    for pieza in piezas:
        db.delete(pieza)
    db.commit()
    return {"mensaje": "Piezas eliminadas correctamente.", "eliminadas": eliminadas}


@app.get("/piezas/buscar/{numero_pieza}")
def buscar_pieza_global(numero_pieza: int, incluir_vendidas: bool = False, db: Session = Depends(get_db)):
    query = (
        db.query(models.Pieza)
        .join(models.Tropa)
        .options(joinedload(models.Pieza.tropa), joinedload(models.Pieza.salidas))
        .filter(models.Pieza.numero_pieza == numero_pieza)
    )
    if not incluir_vendidas:
        query = query.filter(models.Pieza.cerrada.is_(False))
    piezas = query.order_by(models.Pieza.tropa_id.desc()).all()
    return [_pieza_dict(pieza) for pieza in piezas]


@app.get("/tropas/{tropa_id}/piezas/{numero_pieza}/status")
def verificar_pieza_salida(tropa_id: int, numero_pieza: int, db: Session = Depends(get_db)):
    pieza = (
        db.query(models.Pieza)
        .options(joinedload(models.Pieza.tropa), joinedload(models.Pieza.salidas))
        .filter(models.Pieza.tropa_id == tropa_id, models.Pieza.numero_pieza == numero_pieza)
        .first()
    )
    if not pieza:
        raise HTTPException(status_code=404, detail="La pieza no existe en esta tropa.")
    return _pieza_dict(pieza)


@app.get("/piezas/stock/", response_model=list[schemas.Pieza])
def obtener_stock(db: Session = Depends(get_db)):
    return db.query(models.Pieza).filter(models.Pieza.cerrada.is_(False)).all()


# --- Clientes y proveedores ---

@app.post("/clientes/", response_model=schemas.Cliente)
def crear_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(get_db)):
    nombre = cliente.nombre.strip()
    existente = db.query(models.Cliente).filter(models.Cliente.nombre.ilike(nombre)).first()
    if existente:
        return existente
    nuevo = models.Cliente(nombre=nombre)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@app.get("/clientes/", response_model=list[schemas.Cliente])
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(models.Cliente).order_by(models.Cliente.nombre.asc()).all()


@app.post("/proveedores")
@app.post("/proveedores/", response_model=schemas.Proveedor)
def crear_proveedor(proveedor: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    nombre = proveedor.nombre.strip()
    existente = db.query(models.Proveedor).filter(models.Proveedor.nombre.ilike(nombre)).first()
    if existente:
        return existente
    nuevo = models.Proveedor(nombre=nombre)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@app.get("/proveedores")
@app.get("/proveedores/", response_model=list[schemas.Proveedor])
def listar_proveedores(db: Session = Depends(get_db)):
    return db.query(models.Proveedor).order_by(models.Proveedor.nombre.asc()).all()


# --- Salidas normalizadas ---

@app.get("/piezas/{pieza_id}/salidas")
def listar_salidas_pieza(pieza_id: int, db: Session = Depends(get_db)):
    salidas = (
        db.query(models.Salida)
        .options(joinedload(models.Salida.pieza).joinedload(models.Pieza.tropa))
        .filter(models.Salida.pieza_id == pieza_id)
        .order_by(models.Salida.fecha_salida.asc(), models.Salida.id.asc())
        .all()
    )
    return [salida_dict(salida) for salida in salidas]


@app.post("/salidas/")
def registrar_salida(datos: schemas.SalidaCreate, db: Session = Depends(get_db)):
    pieza = (
        db.query(models.Pieza)
        .options(joinedload(models.Pieza.tropa), joinedload(models.Pieza.salidas))
        .filter(models.Pieza.id == datos.pieza_id)
        .first()
    )
    if not pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")

    salida, advertencia = crear_salida(
        db,
        pieza,
        tipo=datos.tipo,
        peso_kg=datos.peso_kg,
        cliente=datos.cliente,
        razon_social_destino=datos.razon_social_destino,
        fecha_salida=datos.fecha_salida,
        peso_salida_camara_kg=datos.peso_salida_camara_kg,
        cierra_pieza=datos.cierra_pieza,
        observaciones=datos.observaciones,
    )
    db.commit()
    db.refresh(salida)
    return {
        "mensaje": "Salida registrada correctamente.",
        "salida": salida_dict(salida),
        "advertencia": advertencia,
        "saldo_kg": saldo_pieza(pieza),
        "cerrada": pieza.cerrada,
    }


@app.put("/salidas/{salida_id}")
def actualizar_salida(salida_id: int, datos: schemas.SalidaUpdate, db: Session = Depends(get_db)):
    salida = (
        db.query(models.Salida)
        .options(joinedload(models.Salida.pieza).joinedload(models.Pieza.tropa))
        .filter(models.Salida.id == salida_id)
        .first()
    )
    if not salida:
        raise HTTPException(status_code=404, detail="Salida no encontrada.")

    cambios = datos.model_dump(exclude_unset=True)
    if cambios.get("tipo") == "Media" and len(salida.pieza.salidas) > 1:
        raise HTTPException(status_code=400, detail="Una media completa no puede convivir con otras salidas parciales.")
    if "cliente" in cambios:
        asegurar_cliente(db, cambios["cliente"])
        salida.cliente = cambios["cliente"].strip()
    if "razon_social_destino" in cambios:
        asegurar_firma(db, cambios["razon_social_destino"])
        salida.razon_social_destino = cambios["razon_social_destino"].strip()
    if "tipo" in cambios:
        salida.tipo = cambios["tipo"]
    if "peso_kg" in cambios:
        salida.peso_kg = cambios["peso_kg"]
    if "fecha_salida" in cambios and cambios["fecha_salida"] is not None:
        salida.fecha_salida = cambios["fecha_salida"]
    if "cierra_pieza" in cambios:
        salida.cierra_pieza = cambios["cierra_pieza"]
    if "observaciones" in cambios:
        salida.observaciones = (cambios["observaciones"] or "").strip() or None
    if salida.tipo == "Media":
        salida.cierra_pieza = True

    recalcular_estado_pieza(salida.pieza)
    advertencia = advertencia_balance(salida.pieza)
    db.commit()
    db.refresh(salida)
    return {
        "mensaje": "Salida actualizada correctamente.",
        "salida": salida_dict(salida),
        "advertencia": advertencia,
        "saldo_kg": saldo_pieza(salida.pieza),
        "cerrada": salida.pieza.cerrada,
    }


@app.delete("/salidas/{salida_id}")
def eliminar_salida(salida_id: int, db: Session = Depends(get_db)):
    salida = db.query(models.Salida).filter(models.Salida.id == salida_id).first()
    if not salida:
        raise HTTPException(status_code=404, detail="Salida no encontrada.")
    pieza = salida.pieza
    db.delete(salida)
    db.flush()
    db.expire(pieza, ["salidas"])
    recalcular_estado_pieza(pieza)
    db.commit()
    return {
        "mensaje": "Salida eliminada. La existencia de la pieza fue recalculada.",
        "saldo_kg": saldo_pieza(pieza),
        "cerrada": pieza.cerrada,
    }


# Compatibility endpoint used by earlier clients.
@app.post("/piezas/salida-rafaga/")
def salida_rafaga(datos: schemas.RegistroSalidaRafaga, db: Session = Depends(get_db)):
    pieza = (
        db.query(models.Pieza)
        .options(joinedload(models.Pieza.tropa), joinedload(models.Pieza.salidas))
        .filter(models.Pieza.tropa_id == datos.tropa_id, models.Pieza.numero_pieza == datos.numero_pieza)
        .first()
    )
    if not pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")

    razon_social = pieza.tropa.firma
    advertencias = []
    if datos.modo == "Media Completa":
        peso = datos.peso_salida_camara_kg or pieza.peso_salida_camara_kg
        salida, advertencia = crear_salida(
            db, pieza, tipo="Media", peso_kg=peso, cliente=datos.destino,
            razon_social_destino=razon_social, peso_salida_camara_kg=datos.peso_salida_camara_kg,
            cierra_pieza=True,
        )
        if advertencia:
            advertencias.append(advertencia)
    elif datos.modo == "Fraccionada" and datos.corte_a_salir == "Ambos":
        if datos.peso_corte_especifico is None:
            raise HTTPException(status_code=400, detail="Ingrese el peso de la pierna.")
        base = float(datos.peso_salida_camara_kg or pieza.peso_salida_camara_kg or 0)
        espalda = base - float(datos.peso_corte_especifico)
        if espalda <= 0:
            raise HTTPException(status_code=400, detail="El peso de pierna no es coherente con la media.")
        crear_salida(
            db, pieza, tipo="Pierna", peso_kg=datos.peso_corte_especifico,
            cliente=datos.destino, razon_social_destino=razon_social,
            peso_salida_camara_kg=datos.peso_salida_camara_kg,
        )
        _, advertencia = crear_salida(
            db, pieza, tipo="Espalda", peso_kg=espalda,
            cliente=datos.destino, razon_social_destino=razon_social, cierra_pieza=True,
        )
        if advertencia:
            advertencias.append(advertencia)
    elif datos.modo == "Fraccionada" and datos.corte_a_salir in {"Pierna", "Espalda"}:
        if datos.peso_corte_especifico is None:
            raise HTTPException(status_code=400, detail="Ingrese el peso real del corte.")
        opuesto = TIPOS_ESPALDA if datos.corte_a_salir == "Pierna" else TIPOS_PIERNA
        cierra = any(salida.tipo in opuesto for salida in pieza.salidas)
        _, advertencia = crear_salida(
            db, pieza, tipo=datos.corte_a_salir, peso_kg=datos.peso_corte_especifico,
            cliente=datos.destino, razon_social_destino=razon_social,
            peso_salida_camara_kg=datos.peso_salida_camara_kg, cierra_pieza=cierra,
        )
        if advertencia:
            advertencias.append(advertencia)
    else:
        raise HTTPException(status_code=400, detail="Modo o corte de salida invalido.")

    db.commit()
    return {
        "mensaje": f"Pieza {datos.numero_pieza} despachada con exito.",
        "advertencia": " ".join(advertencias) or None,
    }


@app.put("/piezas/{pieza_id}/salida")
def editar_salida_pieza(pieza_id: int, datos: schemas.SalidaCorteUpdate, db: Session = Depends(get_db)):
    salida = db.query(models.Salida).filter(
        models.Salida.pieza_id == pieza_id,
        models.Salida.tipo == datos.corte,
    ).order_by(models.Salida.fecha_salida.desc()).first()
    if not salida:
        raise HTTPException(status_code=404, detail=f"No hay una salida de {datos.corte} para editar.")
    if datos.destino is not None:
        asegurar_cliente(db, datos.destino)
        salida.cliente = datos.destino.strip()
    if datos.peso_salida_kg is not None:
        salida.peso_kg = datos.peso_salida_kg
    if datos.fecha_salida is not None:
        salida.fecha_salida = datos.fecha_salida
    recalcular_estado_pieza(salida.pieza)
    advertencia = advertencia_balance(salida.pieza)
    db.commit()
    return {"mensaje": "Salida actualizada correctamente.", "advertencia": advertencia}


# --- Reports ---

@app.get("/salidas/resumen")
def resumen_salidas(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    cliente: str | None = None,
    db: Session = Depends(get_db),
):
    _validar_rango(fecha_desde, fecha_hasta)
    salidas = _query_salidas(db, fecha_desde, fecha_hasta, cliente)

    por_cliente_map = {}
    detalle = []
    for salida in salidas:
        nombre_cliente = salida.cliente or "Sin cliente"
        fila = por_cliente_map.setdefault(nombre_cliente, nueva_fila_cliente(nombre_cliente))
        clave = clave_resumen(salida.tipo, bool(salida.pieza.es_toro))
        fila["registros"] += 1
        fila["kilos"] += float(salida.peso_kg)
        fila[clave] += 1
        fila[f"{clave}_kg"] += float(salida.peso_kg)
        detalle.append(salida_dict(salida))

    por_cliente = list(por_cliente_map.values())
    for fila in por_cliente:
        fila["kilos"] = round(fila["kilos"], 2)
        for clave in list(fila):
            if clave.endswith("_kg"):
                fila[clave] = round(fila[clave], 2)
    por_cliente.sort(key=lambda fila: fila["cliente"].lower())

    prestamos = agrupar_prestamos(salidas)
    return {
        "filtros": {
            "fecha_desde": fecha_desde.isoformat() if fecha_desde else None,
            "fecha_hasta": fecha_hasta.isoformat() if fecha_hasta else None,
            "cliente": cliente,
        },
        "resumen": {
            "registros": len(salidas),
            "clientes": len(por_cliente),
            "kilos_totales": round(sum(float(salida.peso_kg) for salida in salidas), 2),
            "prestamos": sum(grupo["movimientos"] for grupo in prestamos),
            "kilos_prestados": round(sum(grupo["kilos"] for grupo in prestamos), 2),
        },
        "por_cliente": por_cliente,
        "prestamos": prestamos,
        "detalle": detalle,
    }


@app.get("/salidas/clientes")
def clientes_con_salidas(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    db: Session = Depends(get_db),
):
    _validar_rango(fecha_desde, fecha_hasta)
    salidas = _query_salidas(db, fecha_desde, fecha_hasta)
    return {"clientes": sorted({salida.cliente for salida in salidas if salida.cliente}, key=str.lower)}


@app.get("/prestamos/resumen")
def resumen_prestamos(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    db: Session = Depends(get_db),
):
    _validar_rango(fecha_desde, fecha_hasta)
    grupos = agrupar_prestamos(_query_salidas(db, fecha_desde, fecha_hasta))
    return {
        "movimientos": sum(grupo["movimientos"] for grupo in grupos),
        "kilos": round(sum(grupo["kilos"] for grupo in grupos), 2),
        "detalle": grupos,
    }


@app.get("/existencias/diarias")
def existencias_diarias(fecha: date | None = None, db: Session = Depends(get_db)):
    fecha_objetivo = fecha or date.today()
    cierre = datetime.combine(fecha_objetivo + timedelta(days=1), time.min)

    piezas = (
        db.query(models.Pieza)
        .join(models.Tropa)
        .options(joinedload(models.Pieza.tropa), joinedload(models.Pieza.salidas))
        .filter(models.Tropa.fecha_ingreso < cierre)
        .all()
    )
    firmas = {
        firma.nombre.lower(): firma.es_propia
        for firma in db.query(models.FirmaConsignataria).all()
    }

    grupos = defaultdict(lambda: {
        "matadero": "",
        "firma": "",
        "es_propia": False,
        "medias": 0,
        "piernas": 0,
        "espaldas": 0,
        "media_toro": 0,
        "piernas_toro": 0,
        "espaldas_toro": 0,
        "kilos_estimados": 0.0,
    })

    for pieza in piezas:
        salidas_fecha = [salida for salida in pieza.salidas if salida.fecha_salida < cierre]
        clasificacion = clasificar_existencia(pieza, salidas_fecha)
        if not clasificacion:
            continue

        clave = (pieza.tropa.matadero, pieza.tropa.firma)
        grupo = grupos[clave]
        grupo["matadero"] = pieza.tropa.matadero
        grupo["firma"] = pieza.tropa.firma
        grupo["es_propia"] = firmas.get(pieza.tropa.firma.lower(), False)
        grupo[clasificacion] += 1
        peso_salida = sum(float(salida.peso_kg) for salida in salidas_fecha)
        grupo["kilos_estimados"] += max(0.0, peso_base_pieza(pieza) - peso_salida)

    filas = list(grupos.values())
    for fila in filas:
        fila["kilos_estimados"] = round(fila["kilos_estimados"], 2)
    filas.sort(key=lambda fila: (fila["matadero"], not fila["es_propia"], fila["firma"].lower()))

    totales = {
        clave: sum(fila[clave] for fila in filas)
        for clave in ("medias", "piernas", "espaldas", "media_toro", "piernas_toro", "espaldas_toro")
    }
    totales["kilos_estimados"] = round(sum(fila["kilos_estimados"] for fila in filas), 2)
    return {
        "fecha": fecha_objetivo.isoformat(),
        "totales": totales,
        "propias": [fila for fila in filas if fila["es_propia"]],
        "terceros": [fila for fila in filas if not fila["es_propia"]],
    }


# --- Monitor ---

@app.get("/tropas/{tropa_id}/mapa-completo")
def obtener_mapa_tropa(tropa_id: int, db: Session = Depends(get_db)):
    tropa = (
        db.query(models.Tropa)
        .options(joinedload(models.Tropa.piezas).joinedload(models.Pieza.salidas))
        .filter(models.Tropa.id == tropa_id)
        .first()
    )
    if not tropa:
        raise HTTPException(status_code=404, detail="Tropa no encontrada.")

    piezas = []
    for pieza in sorted(tropa.piezas, key=lambda item: item.numero_pieza):
        piezas.append({
            "numero_pieza": pieza.numero_pieza,
            "peso_entrada": float(pieza.peso_entrada_kg),
            "peso_salida_camara": float(pieza.peso_salida_camara_kg) if pieza.peso_salida_camara_kg else None,
            "saldo_kg": saldo_pieza(pieza),
            "es_toro": bool(pieza.es_toro),
            "cerrada": bool(pieza.cerrada),
            "salidas": [salida_dict(salida) for salida in pieza.salidas],
            "pierna": {
                "en_stock": pieza.en_stock_pierna,
                "peso": float(pieza.peso_salida_pierna_kg) if pieza.peso_salida_pierna_kg else None,
                "fecha": pieza.fecha_salida_pierna.strftime("%d/%m/%Y") if pieza.fecha_salida_pierna else None,
                "cliente": pieza.destino_pierna,
            },
            "espalda": {
                "en_stock": pieza.en_stock_espalda,
                "peso": float(pieza.peso_salida_espalda_kg) if pieza.peso_salida_espalda_kg else None,
                "fecha": pieza.fecha_salida_espalda.strftime("%d/%m/%Y") if pieza.fecha_salida_espalda else None,
                "cliente": pieza.destino_espalda,
            },
        })

    return {
        "numero_tropa": tropa.numero_tropa,
        "matadero": tropa.matadero,
        "fecha_ingreso": tropa.fecha_ingreso.strftime("%d/%m/%Y"),
        "firma": tropa.firma,
        "piezas": piezas,
    }


# --- CSV compatibility ---

@app.post("/piezas/salidas-lote/")
def procesar_salidas_lote(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="El archivo debe ser formato .csv")

    reader = csv.DictReader(codecs.iterdecode(file.file, "utf-8-sig"))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="El CSV no tiene encabezados.")
    reader.fieldnames = [(campo or "").strip().lower() for campo in reader.fieldnames]

    requeridas = {"tropa", "pieza", "cliente", "peso_camara", "corte", "peso_corte"}
    faltantes = requeridas.difference(reader.fieldnames)
    if faltantes:
        raise HTTPException(status_code=400, detail="Faltan columnas: " + ", ".join(sorted(faltantes)))

    def numero(valor):
        texto = str(valor or "").strip().replace(",", ".")
        return float(texto) if texto else None

    procesadas = 0
    errores = []
    advertencias = []
    for fila_num, fila in enumerate(reader, start=2):
        fila = {(clave or "").strip().lower(): (valor.strip() if isinstance(valor, str) else valor) for clave, valor in fila.items()}
        if not any(fila.values()):
            continue
        try:
            pieza_numero = numero(fila.get("pieza"))
            if pieza_numero is None or not pieza_numero.is_integer():
                raise ValueError("la columna pieza debe contener un entero")

            tropa = db.query(models.Tropa).filter(models.Tropa.numero_tropa == fila.get("tropa")).first()
            if not tropa:
                raise ValueError(f"tropa {fila.get('tropa')} no encontrada")
            pieza = (
                db.query(models.Pieza)
                .options(joinedload(models.Pieza.tropa), joinedload(models.Pieza.salidas))
                .filter(models.Pieza.tropa_id == tropa.id, models.Pieza.numero_pieza == int(pieza_numero))
                .first()
            )
            if not pieza:
                raise ValueError(f"pieza {int(pieza_numero)} no encontrada")

            corte_csv = (fila.get("corte") or "").strip().lower()
            mapa = {
                "completa": "Media", "media": "Media", "pierna": "Pierna",
                "espalda": "Espalda", "rueda": "Rueda", "completo": "Completo",
                "vacio": "Vacio", "vacío": "Vacio",
            }
            tipo = mapa.get(corte_csv)
            if not tipo:
                raise ValueError(f"corte '{fila.get('corte')}' invalido")

            peso_camara = numero(fila.get("peso_camara"))
            peso = numero(fila.get("peso_corte"))
            if tipo == "Media":
                peso = peso or peso_camara or (float(pieza.peso_salida_camara_kg) if pieza.peso_salida_camara_kg else None)
            if peso is None:
                raise ValueError("falta peso_corte")

            razon_social = fila.get("razon_social") or tropa.firma
            cerrar_txt = (fila.get("cerrar") or "").strip().lower()
            cerrar = tipo == "Media" or cerrar_txt in {"si", "sí", "true", "1", "x"}
            salida, advertencia = crear_salida(
                db, pieza, tipo=tipo, peso_kg=peso, cliente=fila.get("cliente"),
                razon_social_destino=razon_social, peso_salida_camara_kg=peso_camara,
                cierra_pieza=cerrar,
            )
            db.commit()
            if advertencia:
                advertencias.append(f"Fila {fila_num}: {advertencia}")
            procesadas += 1
        except Exception as exc:
            db.rollback()
            detalle = exc.detail if isinstance(exc, HTTPException) else str(exc)
            errores.append(f"Fila {fila_num}: {detalle}")

    return {
        "mensaje": f"Proceso finalizado. {procesadas} despachos exitosos.",
        "errores": errores,
        "advertencias": advertencias,
    }
