from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from datetime import datetime, date
import os
import models
import schemas
from database import engine, get_db
from pydantic import BaseModel
import csv
import codecs

# Esto asegura que las tablas se creen en PostgreSQL al iniciar
models.Base.metadata.create_all(bind=engine)

class PiezaUpdate(BaseModel):
    numero_pieza: int
    peso_entrada_kg: float

def _calcular_advertencia_desbalance(pieza: models.Pieza):
    if pieza.peso_salida_camara_kg is None:
        return None

    if pieza.peso_salida_pierna_kg is None or pieza.peso_salida_espalda_kg is None:
        return None

    peso_camara = float(pieza.peso_salida_camara_kg)
    peso_pierna = float(pieza.peso_salida_pierna_kg)
    peso_espalda = float(pieza.peso_salida_espalda_kg)
    suma_cortes = peso_pierna + peso_espalda
    diferencia = abs(suma_cortes - peso_camara)

    if diferencia > 0.5:
        return (
            f"Advertencia: la suma de cortes ({suma_cortes:.2f} kg) no coincide "
            f"con el peso de cÃ¡mara ({peso_camara:.2f} kg). Diferencia: {diferencia:.2f} kg."
        )
    return None

app = FastAPI(
    title="Sistema de Romaneo", 
    redirect_slashes=False,
    root_path="/api"
)

# CORS: usar ALLOWED_ORIGINS="https://tu-app.vercel.app,https://otro-dominio.com"
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
allow_all_origins = "*" in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else allowed_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Healthcheck rÃ¡pido para verificar deploy
@app.get("/health")
def healthcheck():
    return {"status": "ok"}

# --- ENDPOINTS PARA TROPAS ---

@app.post("/tropas/", response_model=schemas.Tropa)
def crear_tropa(tropa: schemas.TropaCreate, db: Session = Depends(get_db)):
    
    # --- NUEVO: Control preventivo de Tropa duplicada ---
    tropa_existente = db.query(models.Tropa).filter(models.Tropa.numero_tropa == tropa.numero_tropa).first()
    
    if tropa_existente:
        raise HTTPException(
            status_code=400, 
            detail=f"Error: El nÃºmero de tropa '{tropa.numero_tropa}' ya estÃ¡ registrado en el sistema."
        )
    # ----------------------------------------------------

    nueva_tropa = models.Tropa(
        numero_tropa=tropa.numero_tropa,
        matadero=tropa.matadero,
        firma=tropa.firma,
        proveedor_id=tropa.proveedor_id,
        fecha_ingreso=tropa.fecha_ingreso or datetime.utcnow()
    )
    
    db.add(nueva_tropa)
    db.commit()
    db.refresh(nueva_tropa)
    return nueva_tropa

@app.get("/tropas/{tropa_id}/piezas/", response_model=list[schemas.Pieza])
def listar_piezas_tropa(tropa_id: int, db: Session = Depends(get_db)):
    # Trae todas las piezas de esa tropa, ordenadas por número de pieza ascendente.
    piezas = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == tropa_id
    ).order_by(models.Pieza.numero_pieza.asc(), models.Pieza.id.asc()).all()
    
    return piezas

# --- ENDPOINT PARA LEER LAS TROPAS (EL QUE FALTABA) ---
@app.get("/tropas/", response_model=list[schemas.Tropa])
def listar_tropas(db: Session = Depends(get_db)):
    # Trae todas las tropas de la base de datos
    tropas = db.query(models.Tropa).all()
    return tropas

@app.get("/tropas/{tropa_id}/piezas/{numero_pieza}/status")
def verificar_pieza_salida(tropa_id: int, numero_pieza: int, db: Session = Depends(get_db)):
    pieza = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == tropa_id,
        models.Pieza.numero_pieza == numero_pieza
    ).first()
    
    if not pieza:
        raise HTTPException(status_code=404, detail="La pieza no existe en esta tropa.")
        
    if not pieza.en_stock_pierna and not pieza.en_stock_espalda:
        raise HTTPException(status_code=400, detail="Esta pieza ya fue vendida por completo.")
        
    return {
        "id": pieza.id,
        "numero_pieza": pieza.numero_pieza,
        "peso_entrada_kg": float(pieza.peso_entrada_kg),
        "peso_salida_camara_kg": float(pieza.peso_salida_camara_kg) if pieza.peso_salida_camara_kg else None,
        "en_stock_pierna": pieza.en_stock_pierna,
        "en_stock_espalda": pieza.en_stock_espalda,
        # --- NUEVO: Enviamos los pesos individuales para calcular remanentes ---
        "peso_salida_pierna_kg": float(pieza.peso_salida_pierna_kg) if pieza.peso_salida_pierna_kg else 0.0,
        "peso_salida_espalda_kg": float(pieza.peso_salida_espalda_kg) if pieza.peso_salida_espalda_kg else 0.0
    }

@app.put("/tropas/{tropa_id}", response_model=schemas.Tropa)
def actualizar_tropa(tropa_id: int, tropa_update: schemas.TropaCreate, db: Session = Depends(get_db)):
    # 1. Buscar la tropa original
    db_tropa = db.query(models.Tropa).filter(models.Tropa.id == tropa_id).first()
    if not db_tropa:
        raise HTTPException(status_code=404, detail="Tropa no encontrada.")
    
    # 2. Si cambiaron el nÃºmero de tropa, verificar que no coincida con OTRA tropa distinta
    tropa_duplicada = db.query(models.Tropa).filter(
        models.Tropa.numero_tropa == tropa_update.numero_tropa,
        models.Tropa.id != tropa_id # Que no sea ella misma
    ).first()
    
    if tropa_duplicada:
        raise HTTPException(
            status_code=400,
            detail=f"Error: El nÃºmero de tropa '{tropa_update.numero_tropa}' ya estÃ¡ registrado en otra tropa."
        )
    
    # 3. Aplicar los cambios
    db_tropa.numero_tropa = tropa_update.numero_tropa
    db_tropa.matadero = tropa_update.matadero
    db_tropa.firma = tropa_update.firma
    db_tropa.proveedor_id = tropa_update.proveedor_id
    if tropa_update.fecha_ingreso:
        db_tropa.fecha_ingreso = tropa_update.fecha_ingreso
    
    db.commit()
    db.refresh(db_tropa)
    return db_tropa

# --- ENDPOINTS PARA PIEZAS ---

@app.post("/tropas/{tropa_id}/piezas/", response_model=schemas.Pieza)
def cargar_pieza(tropa_id: int, pieza: schemas.PiezaCreate, db: Session = Depends(get_db)):
    tropa_existe = db.query(models.Tropa.id).filter(models.Tropa.id == tropa_id).first()
    if not tropa_existe:
        raise HTTPException(status_code=404, detail="Tropa no encontrada.")

    nueva_pieza = models.Pieza(
        tropa_id=tropa_id,
        numero_pieza=pieza.numero_pieza,
        peso_entrada_kg=pieza.peso_entrada_kg # <--- Guardamos los kg iniciales
    )
    
    try:
        db.add(nueva_pieza)
        db.commit()
        db.refresh(nueva_pieza)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error: La pieza {pieza.numero_pieza} ya fue cargada.")

    return nueva_pieza

# --- ENDPOINT PARA REGISTRAR SALIDA MASIVA/DISCRIMINADA ---

@app.post("/piezas/salida-rafaga/")
def salida_rafaga(datos: schemas.RegistroSalidaRafaga, db: Session = Depends(get_db)):
    pieza = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == datos.tropa_id,
        models.Pieza.numero_pieza == datos.numero_pieza
    ).first()

    if not pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")

    if pieza.peso_salida_camara_kg is None:
        if not datos.peso_salida_camara_kg:
            raise HTTPException(status_code=400, detail="Es el primer egreso de la pieza. Se requiere el peso de cámara.")
        if datos.peso_salida_camara_kg > float(pieza.peso_entrada_kg):
            raise HTTPException(
                status_code=400,
                detail=f"Error: El peso de salida ({datos.peso_salida_camara_kg} kg) no puede superar al de entrada ({pieza.peso_entrada_kg} kg)."
            )
        pieza.peso_salida_camara_kg = datos.peso_salida_camara_kg

    peso_camara_efectivo = float(pieza.peso_salida_camara_kg)
    ahora = datetime.utcnow()

    if datos.modo == "Media Completa":
        if not pieza.en_stock_pierna or not pieza.en_stock_espalda:
            raise HTTPException(status_code=400, detail="No se puede despachar completa porque ya se vendió una parte anteriormente.")

        pieza.en_stock_pierna = False
        pieza.destino_pierna = datos.destino
        pieza.fecha_salida_pierna = ahora
        pieza.peso_salida_pierna_kg = peso_camara_efectivo * 0.55

        pieza.en_stock_espalda = False
        pieza.destino_espalda = datos.destino
        pieza.fecha_salida_espalda = ahora
        pieza.peso_salida_espalda_kg = peso_camara_efectivo * 0.45

    elif datos.modo == "Fraccionada":
        if datos.corte_a_salir == "Ambos":
            if datos.peso_corte_especifico is None:
                raise HTTPException(status_code=400, detail="Para fraccionar ambos cortes, ingresá el peso de la pierna.")

            p_pierna = datos.peso_corte_especifico
            p_espalda = peso_camara_efectivo - p_pierna

            if p_pierna >= peso_camara_efectivo or p_espalda <= 0:
                raise HTTPException(status_code=400, detail="El peso de la pierna no es coherente con el total de cámara.")

            if pieza.en_stock_pierna:
                pieza.en_stock_pierna = False
                pieza.destino_pierna = datos.destino
                pieza.fecha_salida_pierna = ahora
                pieza.peso_salida_pierna_kg = p_pierna
            if pieza.en_stock_espalda:
                pieza.en_stock_espalda = False
                pieza.destino_espalda = datos.destino
                pieza.fecha_salida_espalda = ahora
                pieza.peso_salida_espalda_kg = p_espalda

        elif datos.corte_a_salir == "Pierna":
            if not pieza.en_stock_pierna:
                raise HTTPException(status_code=400, detail="La pierna ya fue despachada. Usá edición de salida para corregirla.")
            if datos.peso_corte_especifico is None:
                raise HTTPException(status_code=400, detail="Ingresá el peso real de la pierna.")

            pieza.en_stock_pierna = False
            pieza.destino_pierna = datos.destino
            pieza.fecha_salida_pierna = ahora
            pieza.peso_salida_pierna_kg = datos.peso_corte_especifico

        elif datos.corte_a_salir == "Espalda":
            if not pieza.en_stock_espalda:
                raise HTTPException(status_code=400, detail="La espalda ya fue despachada. Usá edición de salida para corregirla.")
            if datos.peso_corte_especifico is None:
                raise HTTPException(status_code=400, detail="Ingresá el peso real de la espalda.")

            pieza.en_stock_espalda = False
            pieza.destino_espalda = datos.destino
            pieza.fecha_salida_espalda = ahora
            pieza.peso_salida_espalda_kg = datos.peso_corte_especifico
        else:
            raise HTTPException(status_code=400, detail="Corte inválido para salida fraccionada.")
    else:
        raise HTTPException(status_code=400, detail="Modo de salida inválido.")

    db.commit()
    advertencia = _calcular_advertencia_desbalance(pieza)
    return {
        "mensaje": f"Pieza {datos.numero_pieza} despachada con éxito.",
        "advertencia": advertencia
    }
# --- ENDPOINTS PARA CLIENTES ---

@app.post("/clientes/", response_model=schemas.Cliente)
def crear_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(get_db)):
    # Buscamos si ya existe alguien con ese nombre exacto
    cliente_existente = db.query(models.Cliente).filter(models.Cliente.nombre == cliente.nombre).first()
    if cliente_existente:
        raise HTTPException(status_code=400, detail="Este cliente ya estÃ¡ registrado.")
    
    nuevo_cliente = models.Cliente(nombre=cliente.nombre)
    db.add(nuevo_cliente)
    db.commit()
    db.refresh(nuevo_cliente)
    return nuevo_cliente

@app.get("/clientes/", response_model=list[schemas.Cliente])
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(models.Cliente).all()

@app.get("/piezas/stock/", response_model=list[schemas.Pieza])
def obtener_stock(db: Session = Depends(get_db)):
    # Trae las piezas donde la pierna O la espalda sigan en stock
    stock = db.query(models.Pieza).filter(
        or_(models.Pieza.en_stock_pierna == True, models.Pieza.en_stock_espalda == True)
    ).all()
    return stock

# --- ENDPOINTS PARA PROVEEDORES ---
@app.post("/proveedores")
@app.post("/proveedores/", response_model=schemas.Proveedor)
def crear_proveedor(proveedor: schemas.ProveedorCreate, db: Session = Depends(get_db)):
    prov_existente = db.query(models.Proveedor).filter(models.Proveedor.nombre == proveedor.nombre).first()
    if prov_existente:
        raise HTTPException(status_code=400, detail="Este proveedor ya estÃ¡ registrado.")
    
    nuevo_prov = models.Proveedor(nombre=proveedor.nombre)
    db.add(nuevo_prov)
    db.commit()
    db.refresh(nuevo_prov)
    return nuevo_prov

@app.get("/proveedores")
@app.get("/proveedores/", response_model=list[schemas.Proveedor])
def listar_proveedores(db: Session = Depends(get_db)):
    return db.query(models.Proveedor).all()

@app.put("/piezas/{pieza_id}")
def actualizar_pieza(pieza_id: int, pieza_update: PiezaUpdate, db: Session = Depends(get_db)):
    # 1. Buscamos la pieza original
    db_pieza = db.query(models.Pieza).filter(models.Pieza.id == pieza_id).first()
    if not db_pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")
    
    # 2. Control anti-choque: Si le cambian el nÃºmero, que no pise a OTRA pieza de la MISMA tropa
    pieza_duplicada = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == db_pieza.tropa_id,
        models.Pieza.numero_pieza == pieza_update.numero_pieza,
        models.Pieza.id != pieza_id
    ).first()

    if pieza_duplicada:
        raise HTTPException(status_code=400, detail=f"Error: La pieza NÂº {pieza_update.numero_pieza} ya existe en esta tropa.")
        
    # 3. Guardamos los cambios
    db_pieza.numero_pieza = pieza_update.numero_pieza
    db_pieza.peso_entrada_kg = pieza_update.peso_entrada_kg
    db.commit()
    db.refresh(db_pieza)
    
    return {"mensaje": "Pieza actualizada correctamente"}

@app.delete("/piezas/{pieza_id}")
def eliminar_pieza(pieza_id: int, db: Session = Depends(get_db)):
    db_pieza = db.query(models.Pieza).filter(models.Pieza.id == pieza_id).first()
    if not db_pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")
    
    # --- CONTROL DE SEGURIDAD ---
    # Si alguna parte de la pieza ya no estÃ¡ en stock (se vendiÃ³), bloqueamos el borrado
    if not db_pieza.en_stock_pierna or not db_pieza.en_stock_espalda:
        raise HTTPException(
            status_code=400, 
            detail="Error: No podÃ©s eliminar una pieza que ya tiene cortes despachados."
        )
        
    db.delete(db_pieza)
    db.commit()
    
    return {"mensaje": "Pieza eliminada correctamente"}

@app.delete("/tropas/{tropa_id}/piezas")
@app.delete("/tropas/{tropa_id}/piezas/")
def eliminar_todas_las_piezas_tropa(tropa_id: int, db: Session = Depends(get_db)):
    tropa = db.query(models.Tropa).filter(models.Tropa.id == tropa_id).first()
    if not tropa:
        raise HTTPException(status_code=404, detail="Tropa no encontrada.")

    piezas_tropa = db.query(models.Pieza).filter(models.Pieza.tropa_id == tropa_id).all()
    if len(piezas_tropa) == 0:
        return {"mensaje": "No hay piezas para eliminar en esta tropa.", "eliminadas": 0}

    piezas_con_salida = [
        p for p in piezas_tropa if (not p.en_stock_pierna) or (not p.en_stock_espalda)
    ]
    if piezas_con_salida:
        raise HTTPException(
            status_code=400,
            detail=(
                "No se pueden eliminar todas las piezas porque hay "
                f"{len(piezas_con_salida)} con despachos registrados."
            ),
        )

    eliminadas = len(piezas_tropa)
    db.query(models.Pieza).filter(models.Pieza.tropa_id == tropa_id).delete(synchronize_session=False)
    db.commit()
    return {"mensaje": "Piezas eliminadas correctamente.", "eliminadas": eliminadas}

@app.put("/piezas/{pieza_id}/salida")
def editar_salida_pieza(pieza_id: int, datos: schemas.SalidaCorteUpdate, db: Session = Depends(get_db)):
    pieza = db.query(models.Pieza).filter(models.Pieza.id == pieza_id).first()
    if not pieza:
        raise HTTPException(status_code=404, detail="Pieza no encontrada.")

    if datos.corte == "Pierna":
        if pieza.en_stock_pierna:
            raise HTTPException(status_code=400, detail="La pierna aún no fue despachada.")
        if datos.destino is not None:
            destino = datos.destino.strip()
            if not destino:
                raise HTTPException(status_code=400, detail="El destino no puede estar vacío.")
            pieza.destino_pierna = destino
        if datos.peso_salida_kg is not None:
            if datos.peso_salida_kg <= 0:
                raise HTTPException(status_code=400, detail="El peso de salida debe ser mayor que 0.")
            pieza.peso_salida_pierna_kg = datos.peso_salida_kg
        if datos.fecha_salida is not None:
            pieza.fecha_salida_pierna = datos.fecha_salida
    else:
        if pieza.en_stock_espalda:
            raise HTTPException(status_code=400, detail="La espalda aún no fue despachada.")
        if datos.destino is not None:
            destino = datos.destino.strip()
            if not destino:
                raise HTTPException(status_code=400, detail="El destino no puede estar vacío.")
            pieza.destino_espalda = destino
        if datos.peso_salida_kg is not None:
            if datos.peso_salida_kg <= 0:
                raise HTTPException(status_code=400, detail="El peso de salida debe ser mayor que 0.")
            pieza.peso_salida_espalda_kg = datos.peso_salida_kg
        if datos.fecha_salida is not None:
            pieza.fecha_salida_espalda = datos.fecha_salida

    db.commit()
    advertencia = _calcular_advertencia_desbalance(pieza)
    return {"mensaje": "Salida actualizada correctamente.", "advertencia": advertencia}

@app.get("/piezas/buscar/{numero_pieza}")
def buscar_pieza_global(numero_pieza: int, incluir_vendidas: bool = False, db: Session = Depends(get_db)):
    query = db.query(models.Pieza).join(models.Tropa).filter(
        models.Pieza.numero_pieza == numero_pieza,
    )
    if not incluir_vendidas:
        query = query.filter(
            (models.Pieza.en_stock_pierna == True) | (models.Pieza.en_stock_espalda == True)
        )

    piezas = query.order_by(models.Pieza.tropa_id.desc()).all()

    resultados = []
    for p in piezas:
        resultados.append({
            "id": p.id,
            "numero_pieza": p.numero_pieza,
            "tropa_id": p.tropa_id,
            "numero_tropa": p.tropa.numero_tropa,
            "matadero": p.tropa.matadero,
            "peso_entrada_kg": float(p.peso_entrada_kg),
            "peso_salida_camara_kg": float(p.peso_salida_camara_kg) if p.peso_salida_camara_kg else None,
            "en_stock_pierna": p.en_stock_pierna,
            "en_stock_espalda": p.en_stock_espalda,
            "peso_salida_pierna_kg": float(p.peso_salida_pierna_kg) if p.peso_salida_pierna_kg else 0.0,
            "peso_salida_espalda_kg": float(p.peso_salida_espalda_kg) if p.peso_salida_espalda_kg else 0.0,
            "destino_pierna": p.destino_pierna,
            "destino_espalda": p.destino_espalda,
            "fecha_salida_pierna": p.fecha_salida_pierna.isoformat() if p.fecha_salida_pierna else None,
            "fecha_salida_espalda": p.fecha_salida_espalda.isoformat() if p.fecha_salida_espalda else None,
        })
    return resultados

# Endpoint para ver el "mapa" completo de una tropa
@app.get("/tropas/{tropa_id}/mapa-completo")
def obtener_mapa_tropa(tropa_id: int, db: Session = Depends(get_db)):
    tropa = db.query(models.Tropa).filter(models.Tropa.id == tropa_id).first()
    if not tropa:
        raise HTTPException(status_code=404, detail="Tropa no encontrada")
    
    # Preparamos la lista de piezas con sus datos de venta
    piezas_detalle = []
    for p in tropa.piezas:
        piezas_detalle.append({
            "numero_pieza": p.numero_pieza,
            "peso_entrada": float(p.peso_entrada_kg),
            "peso_salida_camara": float(p.peso_salida_camara_kg) if p.peso_salida_camara_kg else None,
            "pierna": {
                "en_stock": p.en_stock_pierna,
                "peso": float(p.peso_salida_pierna_kg) if p.peso_salida_pierna_kg else None,
                "fecha": p.fecha_salida_pierna.strftime("%d/%m/%Y") if p.fecha_salida_pierna else None,
                "cliente": p.destino_pierna
            },
            "espalda": {
                "en_stock": p.en_stock_espalda,
                "peso": float(p.peso_salida_espalda_kg) if p.peso_salida_espalda_kg else None,
                "fecha": p.fecha_salida_espalda.strftime("%d/%m/%Y") if p.fecha_salida_espalda else None,
                "cliente": p.destino_espalda
            }
        })
    
    # Ordenar por nÃºmero de pieza para que el cuadro sea prolijo
    piezas_detalle.sort(key=lambda x: x["numero_pieza"])

    return {
        "numero_tropa": tropa.numero_tropa,
        "matadero": tropa.matadero,
        "fecha_ingreso": tropa.fecha_ingreso.strftime("%d/%m/%Y"),
        "firma": tropa.firma,
        "piezas": piezas_detalle
    }


@app.get("/salidas/resumen")
def resumen_salidas(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    cliente: str | None = None,
    db: Session = Depends(get_db),
):
    if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
        raise HTTPException(status_code=400, detail="La fecha desde no puede ser mayor que la fecha hasta.")

    piezas = db.query(models.Pieza).join(models.Tropa).filter(
        (models.Pieza.fecha_salida_pierna != None) | (models.Pieza.fecha_salida_espalda != None)
    ).all()

    cliente_filtro = cliente.strip().lower() if cliente else None
    detalle = []

    for pieza in piezas:
        if pieza.fecha_salida_pierna is not None:
            fecha = pieza.fecha_salida_pierna.date()
            if fecha_desde and fecha < fecha_desde:
                pass
            elif fecha_hasta and fecha > fecha_hasta:
                pass
            elif cliente_filtro and cliente_filtro not in (pieza.destino_pierna or "").lower():
                pass
            else:
                detalle.append({
                    "fecha": pieza.fecha_salida_pierna.date().isoformat(),
                    "fecha_hora": pieza.fecha_salida_pierna.isoformat(),
                    "cliente": pieza.destino_pierna,
                    "tropa_id": pieza.tropa_id,
                    "numero_tropa": pieza.tropa.numero_tropa,
                    "matadero": pieza.tropa.matadero,
                    "firma": pieza.tropa.firma,
                    "numero_pieza": pieza.numero_pieza,
                    "corte": "Pierna",
                    "peso_kg": float(pieza.peso_salida_pierna_kg or 0),
                })

        if pieza.fecha_salida_espalda is not None:
            fecha = pieza.fecha_salida_espalda.date()
            if fecha_desde and fecha < fecha_desde:
                pass
            elif fecha_hasta and fecha > fecha_hasta:
                pass
            elif cliente_filtro and cliente_filtro not in (pieza.destino_espalda or "").lower():
                pass
            else:
                detalle.append({
                    "fecha": pieza.fecha_salida_espalda.date().isoformat(),
                    "fecha_hora": pieza.fecha_salida_espalda.isoformat(),
                    "cliente": pieza.destino_espalda,
                    "tropa_id": pieza.tropa_id,
                    "numero_tropa": pieza.tropa.numero_tropa,
                    "matadero": pieza.tropa.matadero,
                    "firma": pieza.tropa.firma,
                    "numero_pieza": pieza.numero_pieza,
                    "corte": "Espalda",
                    "peso_kg": float(pieza.peso_salida_espalda_kg or 0),
                })

    detalle.sort(key=lambda x: (x["fecha"], x["cliente"] or "", x["numero_tropa"], x["numero_pieza"], x["corte"]))

    total_kilos = round(sum(d["peso_kg"] for d in detalle), 2)
    por_cliente_map = {}
    for fila in detalle:
        nom = fila["cliente"] or "Sin cliente"
        por_cliente_map.setdefault(nom, {"cliente": nom, "kilos": 0.0, "registros": 0})
        por_cliente_map[nom]["kilos"] += fila["peso_kg"]
        por_cliente_map[nom]["registros"] += 1

    por_cliente = list(por_cliente_map.values())
    por_cliente.sort(key=lambda x: x["kilos"], reverse=True)
    for c in por_cliente:
        c["kilos"] = round(c["kilos"], 2)

    return {
        "filtros": {
            "fecha_desde": fecha_desde.isoformat() if fecha_desde else None,
            "fecha_hasta": fecha_hasta.isoformat() if fecha_hasta else None,
            "cliente": cliente,
        },
        "resumen": {
            "registros": len(detalle),
            "clientes": len(por_cliente),
            "kilos_totales": total_kilos,
        },
        "por_cliente": por_cliente,
        "detalle": detalle,
    }

@app.post("/piezas/salidas-lote/")
def procesar_salidas_lote(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # Verificamos que sea un archivo valido
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="El archivo debe ser formato .csv")

    # Leemos el archivo linea por linea
    csvReader = csv.DictReader(codecs.iterdecode(file.file, 'utf-8'))
    if not csvReader.fieldnames:
        raise HTTPException(status_code=400, detail="El CSV no tiene encabezados.")

    # Normalizamos encabezados para tolerar BOM, mayusculas y espacios.
    csvReader.fieldnames = [
        (encabezado or "").strip().lower().lstrip("\ufeff")
        for encabezado in csvReader.fieldnames
    ]

    columnas_requeridas = {"tropa", "pieza", "cliente", "peso_camara", "corte", "peso_corte"}
    faltantes = columnas_requeridas.difference(set(csvReader.fieldnames))
    if faltantes:
        raise HTTPException(
            status_code=400,
            detail=(
                "Encabezados invalidos. Faltan columnas: "
                + ", ".join(sorted(faltantes))
                + ". Encabezados detectados: "
                + ", ".join(csvReader.fieldnames)
            ),
        )

    def parse_float_csv(valor):
        if valor is None:
            return None
        txt = str(valor).strip()
        if txt == "":
            return None
        txt = txt.replace(",", ".")
        return float(txt)

    procesadas = 0
    errores = []
    advertencias = []

    for fila_num, fila in enumerate(csvReader, start=2):  # Start 2 por el encabezado
        try:
            fila_normalizada = {
                (k or "").strip().lower().lstrip("\ufeff"): (v.strip() if isinstance(v, str) else v)
                for k, v in fila.items()
            }

            # Saltar filas totalmente vacias.
            if all((v is None or str(v).strip() == "") for v in fila_normalizada.values()):
                continue

            num_tropa = fila_normalizada.get("tropa")
            destino = fila_normalizada.get("cliente")
            corte = fila_normalizada.get("corte")  # "Completa", "Pierna", "Espalda"
            peso_camara = parse_float_csv(fila_normalizada.get("peso_camara"))
            peso_corte = parse_float_csv(fila_normalizada.get("peso_corte"))

            pieza_raw = fila_normalizada.get("pieza")
            if pieza_raw is None or str(pieza_raw).strip() == "":
                errores.append(f"Fila {fila_num}: Falta el numero de pieza en la columna 'pieza'.")
                continue

            try:
                pieza_num_float = float(str(pieza_raw).strip().replace(",", "."))
                if not pieza_num_float.is_integer():
                    errores.append(f"Fila {fila_num}: El valor de pieza '{pieza_raw}' no es un entero valido.")
                    continue
                num_pieza = int(pieza_num_float)
            except ValueError:
                errores.append(f"Fila {fila_num}: El valor de pieza '{pieza_raw}' no es numerico.")
                continue

            # 1. Buscar la Tropa
            tropa_db = db.query(models.Tropa).filter(models.Tropa.numero_tropa == num_tropa).first()
            if not tropa_db:
                errores.append(f"Fila {fila_num}: Tropa {num_tropa} no encontrada.")
                continue

            # 2. Buscar la Pieza
            pieza_db = db.query(models.Pieza).filter(
                models.Pieza.tropa_id == tropa_db.id,
                models.Pieza.numero_pieza == num_pieza
            ).first()
            if not pieza_db:
                errores.append(f"Fila {fila_num}: Pieza {num_pieza} no encontrada en tropa {num_tropa}.")
                continue

            # 3. Validaciones basicas de stock
            if corte == 'Completa' and (not pieza_db.en_stock_pierna or not pieza_db.en_stock_espalda):
                errores.append(f"Fila {fila_num}: La pieza {num_pieza} ya tiene partes vendidas, no puede salir Completa.")
                continue

            # 4. Asignar peso de camara si es la primera salida
            if not pieza_db.peso_salida_camara_kg:
                if not peso_camara:
                    errores.append(f"Fila {fila_num}: Falta el peso_camara para la primera venta de la pieza {num_pieza}.")
                    continue
                pieza_db.peso_salida_camara_kg = peso_camara

            peso_camara_efectivo = float(pieza_db.peso_salida_camara_kg)
            ahora = datetime.utcnow()

            # 5. Logica de despacho
            if corte == 'Completa':
                pieza_db.en_stock_pierna = False
                pieza_db.destino_pierna = destino
                pieza_db.fecha_salida_pierna = ahora
                pieza_db.peso_salida_pierna_kg = peso_camara_efectivo / 2

                pieza_db.en_stock_espalda = False
                pieza_db.destino_espalda = destino
                pieza_db.fecha_salida_espalda = ahora
                pieza_db.peso_salida_espalda_kg = peso_camara_efectivo / 2

            elif corte == 'Pierna' and pieza_db.en_stock_pierna:
                if peso_corte is None:
                    errores.append(f"Fila {fila_num}: Falta peso_corte para la pierna.")
                    continue
                peso_real = peso_corte
                pieza_db.en_stock_pierna = False
                pieza_db.destino_pierna = destino
                pieza_db.fecha_salida_pierna = ahora
                pieza_db.peso_salida_pierna_kg = peso_real

            elif corte == 'Espalda' and pieza_db.en_stock_espalda:
                if peso_corte is None:
                    errores.append(f"Fila {fila_num}: Falta peso_corte para la espalda.")
                    continue
                peso_real = peso_corte
                pieza_db.en_stock_espalda = False
                pieza_db.destino_espalda = destino
                pieza_db.fecha_salida_espalda = ahora
                pieza_db.peso_salida_espalda_kg = peso_real
            
            else:
                errores.append(f"Fila {fila_num}: Corte {corte} invÃ¡lido o sin stock para la pieza {num_pieza}.")
                continue

            db.commit()
            advertencia = _calcular_advertencia_desbalance(pieza_db)
            if advertencia:
                advertencias.append(f"Fila {fila_num}: {advertencia}")
            procesadas += 1

        except Exception as e:
            errores.append(f"Fila {fila_num}: Error de formato o datos ({str(e)}).")

    return {
        "mensaje": f"Proceso finalizado. {procesadas} despachos exitosos.",
        "errores": errores,
        "advertencias": advertencias
    }
