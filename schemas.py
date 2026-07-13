from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


MATADEROS_PERMITIDOS = Literal["Vildoza", "Maria del Carmen"]
TIPOS_SALIDA = Literal["Media", "Pierna", "Espalda", "Rueda", "Completo", "Vacio"]


class ProveedorBase(BaseModel):
    nombre: str


class ProveedorCreate(ProveedorBase):
    pass


class Proveedor(ProveedorBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class PiezaCreate(BaseModel):
    numero_pieza: int
    peso_entrada_kg: float = Field(gt=0)
    es_toro: bool = False


class PiezaUpdate(PiezaCreate):
    pass


class Pieza(BaseModel):
    id: int
    tropa_id: int
    numero_pieza: int
    peso_entrada_kg: float
    peso_salida_camara_kg: Optional[float] = None
    es_toro: bool = False
    cerrada: bool = False

    en_stock_pierna: bool
    destino_pierna: Optional[str] = None
    fecha_salida_pierna: Optional[datetime] = None
    peso_salida_pierna_kg: Optional[float] = None

    en_stock_espalda: bool
    destino_espalda: Optional[str] = None
    fecha_salida_espalda: Optional[datetime] = None
    peso_salida_espalda_kg: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class TropaBase(BaseModel):
    numero_tropa: str
    matadero: MATADEROS_PERMITIDOS
    firma: str
    proveedor_id: Optional[int] = None
    fecha_ingreso: Optional[datetime] = None


class TropaCreate(TropaBase):
    pass


class Tropa(TropaBase):
    id: int
    fecha_ingreso: datetime
    proveedor: Optional[Proveedor] = None
    model_config = ConfigDict(from_attributes=True)


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


class SalidaCreate(BaseModel):
    pieza_id: int
    tipo: TIPOS_SALIDA
    peso_kg: float = Field(gt=0)
    cliente: str
    razon_social_destino: str
    fecha_salida: Optional[datetime] = None
    peso_salida_camara_kg: Optional[float] = Field(default=None, gt=0)
    cierra_pieza: bool = False
    observaciones: Optional[str] = None


class SalidaUpdate(BaseModel):
    tipo: Optional[TIPOS_SALIDA] = None
    peso_kg: Optional[float] = Field(default=None, gt=0)
    cliente: Optional[str] = None
    razon_social_destino: Optional[str] = None
    fecha_salida: Optional[datetime] = None
    cierra_pieza: Optional[bool] = None
    observaciones: Optional[str] = None


class Salida(BaseModel):
    id: int
    pieza_id: int
    tipo: str
    peso_kg: float
    cliente: str
    razon_social_origen: str
    razon_social_destino: str
    fecha_salida: datetime
    cierra_pieza: bool
    observaciones: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class FirmaBase(BaseModel):
    nombre: str
    es_propia: bool = False


class FirmaCreate(FirmaBase):
    pass


class Firma(FirmaBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class ClienteBase(BaseModel):
    nombre: str


class ClienteCreate(ClienteBase):
    pass


class Cliente(ClienteBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
