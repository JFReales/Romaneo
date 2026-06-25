from pydantic import BaseModel, ConfigDict
from typing import Optional, Literal
from datetime import datetime

FIRMAS_PERMITIDAS = Literal[
    "Erre de Mayoristas S.A.",
    "Ganadera Roberto Graziotin S.A.",
    "Hacienda de Raza S.A.",
    "Razas de altura S.A."
]

MATADEROS_PERMITIDOS = Literal[
    "Vildoza",
    "Maria del Carmen"
]

# --- SCHEMAS PARA PROVEEDORES ---
class ProveedorBase(BaseModel):
    nombre: str

class ProveedorCreate(ProveedorBase):
    pass

class Proveedor(ProveedorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# --- SCHEMAS PARA PIEZAS ---
class PiezaCreate(BaseModel):
    numero_pieza: int
    peso_entrada_kg: float

class Pieza(BaseModel):
    id: int
    tropa_id: int
    numero_pieza: int
    peso_entrada_kg: float
    
    en_stock_pierna: bool
    destino_pierna: Optional[str] = None
    fecha_salida_pierna: Optional[datetime] = None
    peso_salida_pierna_kg: Optional[float] = None
    
    en_stock_espalda: bool
    destino_espalda: Optional[str] = None
    fecha_salida_espalda: Optional[datetime] = None
    peso_salida_espalda_kg: Optional[float] = None
    
    model_config = ConfigDict(from_attributes=True)

# --- SCHEMAS PARA TROPAS ---
# (Asegurate de que estén tus Literal de FIRMAS y MATADEROS arriba)
class TropaBase(BaseModel):
    numero_tropa: str
    matadero: MATADEROS_PERMITIDOS
    firma: FIRMAS_PERMITIDAS
    proveedor_id: Optional[int] = None
    fecha_ingreso: Optional[datetime] = None

class TropaCreate(TropaBase):
    pass

class Tropa(TropaBase):
    id: int
    fecha_ingreso: datetime
    proveedor: Optional[Proveedor] = None # <--- Usamos el esquema de Proveedor
    
    model_config = ConfigDict(from_attributes=True)

# Modificá el esquema de salidas para que procese una pieza a la vez de forma ráfaga
class RegistroSalidaRafaga(BaseModel):
    tropa_id: int
    numero_pieza: int
    destino: str
    modo: str
    peso_salida_camara_kg: Optional[float] = None
    corte_a_salir: Optional[str] = None
    peso_corte_especifico: Optional[float] = None

class SalidaCorteUpdate(BaseModel):
    corte: Literal["Pierna", "Espalda"]
    destino: Optional[str] = None
    peso_salida_kg: Optional[float] = None
    fecha_salida: Optional[datetime] = None

# --- SCHEMAS PARA CLIENTES ---
class ClienteBase(BaseModel):
    nombre: str

class ClienteCreate(ClienteBase):
    pass

class Cliente(ClienteBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

