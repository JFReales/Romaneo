from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from datetime import datetime
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

app = FastAPI(title="Sistema de Romaneo", redirect_slashes=False)

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

# Healthcheck rápido para verificar deploy
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
            detail=f"Error: El número de tropa '{tropa.numero_tropa}' ya está registrado en el sistema."
        )
    # ----------------------------------------------------

    nueva_tropa = models.Tropa(
        numero_tropa=tropa.numero_tropa,
        matadero=tropa.matadero,
        firma=tropa.firma,
        proveedor_id=tropa.proveedor_id
    )
    
    db.add(nueva_tropa)
    db.commit()
    db.refresh(nueva_tropa)
    return nueva_tropa

@app.get("/tropas/{tropa_id}/piezas/", response_model=list[schemas.Pieza])
def listar_piezas_tropa(tropa_id: int, db: Session = Depends(get_db)):
    # Trae todas las piezas de esa tropa, ordenadas por ID descendente (la última cargada sale arriba)
    piezas = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == tropa_id
    ).order_by(models.Pieza.id.asc()).all()
    
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
    
    # 2. Si cambiaron el número de tropa, verificar que no coincida con OTRA tropa distinta
    tropa_duplicada = db.query(models.Tropa).filter(
        models.Tropa.numero_tropa == tropa_update.numero_tropa,
        models.Tropa.id != tropa_id # Que no sea ella misma
    ).first()
    
    if tropa_duplicada:
        raise HTTPException(
            status_code=400,
            detail=f"Error: El número de tropa '{tropa_update.numero_tropa}' ya está registrado en otra tropa."
        )
    
    # 3. Aplicar los cambios
    db_tropa.numero_tropa = tropa_update.numero_tropa
    db_tropa.matadero = tropa_update.matadero
    db_tropa.firma = tropa_update.firma
    db_tropa.proveedor_id = tropa_update.proveedor_id
    
    db.commit()
    db.refresh(db_tropa)
    return db_tropa

# --- ENDPOINTS PARA PIEZAS ---

@app.post("/tropas/{tropa_id}/piezas/", response_model=schemas.Pieza)
def cargar_pieza(tropa_id: int, pieza: schemas.PiezaCreate, db: Session = Depends(get_db)):
    tropa = db.query(models.Tropa).filter(models.Tropa.id == tropa_id).first()
    if not tropa:
        raise HTTPException(status_code=404, detail="Tropa no encontrada.")

    pieza_duplicada = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == tropa_id,
        models.Pieza.numero_pieza == pieza.numero_pieza
    ).first()
    
    if pieza_duplicada:
        raise HTTPException(status_code=400, detail=f"Error: La pieza {pieza.numero_pieza} ya fue cargada.")

    nueva_pieza = models.Pieza(
        tropa_id=tropa_id,
        numero_pieza=pieza.numero_pieza,
        peso_entrada_kg=pieza.peso_entrada_kg # <--- Guardamos los kg iniciales
    )
    
    db.add(nueva_pieza)
    db.commit()
    db.refresh(nueva_pieza)
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

    # REGLA 1: Registrar o validar el peso de salida de la cámara
    if pieza.peso_salida_camara_kg is None:
        if not datos.peso_salida_camara_kg:
            raise HTTPException(status_code=400, detail="Es el primer egreso de la pieza, se requiere el Peso de Cámara.")
        
        # REGLA 2: El peso de salida nunca puede ser mayor que el de entrada
        if datos.peso_salida_camara_kg > float(pieza.peso_entrada_kg):
            raise HTTPException(status_code=400, detail=f"Error: El peso de salida ({datos.peso_salida_camara_kg} kg) no puede superar al de entrada ({pieza.peso_entrada_kg} kg).")
        
        pieza.peso_salida_camara_kg = datos.peso_salida_camara_kg
    
    peso_camara_efectivo = float(pieza.peso_salida_camara_kg)

    # PROCESAMIENTO SEGÚN MODO
    ahora = datetime.utcnow()
    
    if datos.modo == "Media Completa":
        if not pieza.en_stock_pierna or not pieza.en_stock_espalda:
            raise HTTPException(status_code=400, detail="No se puede despachar completa porque ya se vendió una parte anteriormente.")
        
        # Se va entera: asignamos el peso proporcional o directo a cada parte
        pieza.en_stock_pierna = False
        pieza.destino_pierna = datos.destino
        pieza.fecha_salida_pierna = ahora
        pieza.peso_salida_pierna_kg = peso_camara_efectivo * 0.55 # Proporción estimada o podés guardarlo entero
        
        pieza.en_stock_espalda = False
        pieza.destino_espalda = datos.destino
        pieza.fecha_salida_espalda = ahora
        pieza.peso_salida_espalda_kg = peso_camara_efectivo * 0.45
        
    elif datos.modo == "Fraccionada":
        if datos.corte_a_salir == "Ambos":
            if not datos.peso_corte_especifico: # <-- Corregido
                raise HTTPException(status_code=400, detail="Para fraccionar ambos cortes, ingresá el peso de la pierna.")
            
            p_pierna = datos.peso_corte_especifico
            p_espalda = peso_camara_efectivo - p_pierna
            
            if p_pierna >= peso_camara_efectivo or p_espalda <= 0:
                raise HTTPException(status_code=400, detail="El peso de la pierna no es coherente con el total de la cámara.")

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

        elif datos.corte_a_salir == "Pierna" and pieza.en_stock_pierna:
            peso_real = datos.peso_corte_especifico if pieza.en_stock_espalda else (peso_camara_efectivo - float(pieza.peso_salida_espalda_kg or 0))
            pieza.en_stock_pierna = False
            pieza.destino_pierna = datos.destino
            pieza.fecha_salida_pierna = ahora
            pieza.peso_salida_pierna_kg = peso_real
            
        elif datos.corte_a_salir == "Espalda" and pieza.en_stock_espalda:
            peso_real = datos.peso_corte_especifico if pieza.en_stock_pierna else (peso_camara_efectivo - float(pieza.peso_salida_pierna_kg or 0))
            pieza.en_stock_espalda = False
            pieza.destino_espalda = datos.destino
            pieza.fecha_salida_espalda = ahora
            pieza.peso_salida_espalda_kg = peso_real

    db.commit()
    return {"mensaje": f"Pieza {datos.numero_pieza} despachada con éxito."}

# --- ENDPOINTS PARA CLIENTES ---

@app.post("/clientes/", response_model=schemas.Cliente)
def crear_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(get_db)):
    # Buscamos si ya existe alguien con ese nombre exacto
    cliente_existente = db.query(models.Cliente).filter(models.Cliente.nombre == cliente.nombre).first()
    if cliente_existente:
        raise HTTPException(status_code=400, detail="Este cliente ya está registrado.")
    
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
        raise HTTPException(status_code=400, detail="Este proveedor ya está registrado.")
    
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
    
    # 2. Control anti-choque: Si le cambian el número, que no pise a OTRA pieza de la MISMA tropa
    pieza_duplicada = db.query(models.Pieza).filter(
        models.Pieza.tropa_id == db_pieza.tropa_id,
        models.Pieza.numero_pieza == pieza_update.numero_pieza,
        models.Pieza.id != pieza_id
    ).first()

    if pieza_duplicada:
        raise HTTPException(status_code=400, detail=f"Error: La pieza Nº {pieza_update.numero_pieza} ya existe en esta tropa.")
        
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
    # Si alguna parte de la pieza ya no está en stock (se vendió), bloqueamos el borrado
    if not db_pieza.en_stock_pierna or not db_pieza.en_stock_espalda:
        raise HTTPException(
            status_code=400, 
            detail="Error: No podés eliminar una pieza que ya tiene cortes despachados."
        )
        
    db.delete(db_pieza)
    db.commit()
    
    return {"mensaje": "Pieza eliminada correctamente"}

@app.get("/piezas/buscar/{numero_pieza}")
def buscar_pieza_global(numero_pieza: int, db: Session = Depends(get_db)):
    # Buscamos las piezas que tengan ese número y que NO estén 100% vendidas
    piezas = db.query(models.Pieza).join(models.Tropa).filter(
        models.Pieza.numero_pieza == numero_pieza,
        (models.Pieza.en_stock_pierna == True) | (models.Pieza.en_stock_espalda == True)
    ).all()
    
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
            "peso_salida_espalda_kg": float(p.peso_salida_espalda_kg) if p.peso_salida_espalda_kg else 0.0
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
    
    # Ordenar por número de pieza para que el cuadro sea prolijo
    piezas_detalle.sort(key=lambda x: x["numero_pieza"])

    return {
        "numero_tropa": tropa.numero_tropa,
        "matadero": tropa.matadero,
        "fecha_ingreso": tropa.fecha_ingreso.strftime("%d/%m/%Y"),
        "firma": tropa.firma,
        "piezas": piezas_detalle
    }

@app.post("/piezas/salidas-lote/")
def procesar_salidas_lote(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # Verificamos que sea un archivo válido
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="El archivo debe ser formato .csv")

    # Leemos el archivo línea por línea
    csvReader = csv.DictReader(codecs.iterdecode(file.file, 'utf-8'))
    
    procesadas = 0
    errores = []

    for fila_num, fila in enumerate(csvReader, start=2): # Start 2 por el encabezado
        try:
            # Los nombres de las columnas deben coincidir exactamente con el Excel/CSV
            num_tropa = fila.get('tropa')
            num_pieza = int(fila.get('pieza'))
            destino = fila.get('cliente')
            peso_camara = float(fila.get('peso_camara')) if fila.get('peso_camara') else None
            corte = fila.get('corte') # "Completa", "Pierna", "Espalda"
            peso_corte = float(fila.get('peso_corte')) if fila.get('peso_corte') else None

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

            # 3. Validaciones básicas de stock
            if corte == 'Completa' and (not pieza_db.en_stock_pierna or not pieza_db.en_stock_espalda):
                errores.append(f"Fila {fila_num}: La pieza {num_pieza} ya tiene partes vendidas, no puede salir Completa.")
                continue

            # 4. Asignar peso de cámara si es la primera salida
            if not pieza_db.peso_salida_camara_kg:
                if not peso_camara:
                    errores.append(f"Fila {fila_num}: Falta el peso_camara para la primera venta de la pieza {num_pieza}.")
                    continue
                pieza_db.peso_salida_camara_kg = peso_camara

            peso_camara_efectivo = float(pieza_db.peso_salida_camara_kg)
            ahora = datetime.utcnow()

            # 5. Lógica de Despacho
            if corte == 'Completa':
                pieza_db.en_stock_pierna = False
                pieza_db.destino_pierna = destino
                pieza_db.fecha_salida_pierna = ahora
                pieza_db.peso_salida_pierna_kg = peso_camara_efectivo / 2 # Mitad teórica o lo manejas a gusto

                pieza_db.en_stock_espalda = False
                pieza_db.destino_espalda = destino
                pieza_db.fecha_salida_espalda = ahora
                pieza_db.peso_salida_espalda_kg = peso_camara_efectivo / 2

            elif corte == 'Pierna' and pieza_db.en_stock_pierna:
                peso_real = peso_corte if pieza_db.en_stock_espalda else (peso_camara_efectivo - float(pieza_db.peso_salida_espalda_kg or 0))
                pieza_db.en_stock_pierna = False
                pieza_db.destino_pierna = destino
                pieza_db.fecha_salida_pierna = ahora
                pieza_db.peso_salida_pierna_kg = peso_real

            elif corte == 'Espalda' and pieza_db.en_stock_espalda:
                peso_real = peso_corte if pieza_db.en_stock_pierna else (peso_camara_efectivo - float(pieza_db.peso_salida_pierna_kg or 0))
                pieza_db.en_stock_espalda = False
                pieza_db.destino_espalda = destino
                pieza_db.fecha_salida_espalda = ahora
                pieza_db.peso_salida_espalda_kg = peso_real
            
            else:
                errores.append(f"Fila {fila_num}: Corte {corte} inválido o sin stock para la pieza {num_pieza}.")
                continue

            db.commit()
            procesadas += 1

        except Exception as e:
            errores.append(f"Fila {fila_num}: Error de formato o datos ({str(e)}).")

    return {
        "mensaje": f"Proceso finalizado. {procesadas} despachos exitosos.",
        "errores": errores
    }
