#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
 CARRIER WATER SYSTEM DESIGNER  ·  v1.1 · integración THERMABOT
 Motor de cálculo para sistemas de agua de dos caños (chilled / hot water)
 Basado en: Carrier System Design Manual — Part 3 (Piping) & Part 12 (Water/DX)

 Integración: recibe cargas térmicas por espacio y devuelve diseño completo
 de tubería, bombas, tanque de expansión y soportes.

 Uso CLI:
     python carrier_water.py --input ejemplo.json
     python carrier_water.py --demo
     python carrier_water.py --input ej.json --json-output result.json
     python carrier_water.py --input ej.json --no-color

 Uso como librería:
     from carrier_water import SistemaAgua, ejecutar_pipeline, cargar_json
     sistema = cargar_json("proyecto.json")
     resultado = ejecutar_pipeline(sistema)
═══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import argparse
import json
import sys
import math
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional, Sequence, Any

# ═══════════════════════════════════════════════════════════════════════════════
# SECCIÓN 1 — CONSTANTES Y UNIDADES
# ═══════════════════════════════════════════════════════════════════════════════
VERSION          = "1.1.0"
FACTOR_500       = 500.0        # BTU/h · (GPM · °F)^-1  @ 60°F  [P12-pág.5]
GAL_PER_LB_AGUA  = 8.34         # [P3-pág.4]
PSI_TO_FT_H2O    = 2.31
G_FPS2           = 32.17        # [P3-pág.47]
TOLERANCIA_FPS   = 0.10         # corrección C4
FACTOR_OVERCOOL  = 1.05         # 5% overcooling  [P12-pág.6]

# ═══════════════════════════════════════════════════════════════════════════════
# SECCIÓN 2 — PALETA ANSI (sin dependencias externas)
# ═══════════════════════════════════════════════════════════════════════════════
class C:
    """Colores ANSI. Llamar C.disable() para desactivar."""
    RESET="\033[0m"; BOLD="\033[1m"; DIM="\033[2m"; ITALIC="\033[3m"; UNDERLINE="\033[4m"
    RED="\033[91m"; GREEN="\033[92m"; YELLOW="\033[93m"; BLUE="\033[94m"
    MAGENTA="\033[95m"; CYAN="\033[96m"; WHITE="\033[97m"; GREY="\033[90m"
    BG_BLUE="\033[44m"; BG_GREEN="\033[42m"; BG_RED="\033[41m"; BG_YELLOW="\033[43m"

    @classmethod
    def disable(cls):
        for attr in list(vars(cls)):
            if attr.isupper() and not attr.startswith("_"):
                setattr(cls, attr, "")

    @classmethod
    def enable(cls):
        for key,value in ANSI_PALETTE.items():setattr(cls,key,value)

# ═══════════════════════════════════════════════════════════════════════════════
# SECCIÓN 3 — HELPERS DE FORMATO
# ═══════════════════════════════════════════════════════════════════════════════
TERM_WIDTH = 78

def banner(titulo: str, subtitulo: str = "", color: str = C.CYAN) -> str:
    """Banner superior con doble borde."""
    ancho = TERM_WIDTH - 2
    lineas = [f"{color}╔{'═'*ancho}╗{C.RESET}"]
    lineas.append(f"{color}║{C.RESET} {C.BOLD}{titulo:<{ancho-2}}{C.RESET} {color}║{C.RESET}")
    if subtitulo:
        lineas.append(f"{color}║{C.RESET} {C.DIM}{subtitulo:<{ancho-2}}{C.RESET} {color}║{C.RESET}")
    lineas.append(f"{color}╚{'═'*ancho}╝{C.RESET}")
    return "\n".join(lineas)

def seccion(num: int, total: int, titulo: str) -> str:
    """Encabezado de paso."""
    tag = f"{C.BOLD}{C.BLUE}► PASO {num}/{total}{C.RESET}"
    return f"\n{tag}  {C.BOLD}{titulo}{C.RESET}\n{C.GREY}{'─'*TERM_WIDTH}{C.RESET}"

def ok(msg: str)    -> str: return f"  {C.GREEN}✓{C.RESET} {msg}"
def warn(msg: str)  -> str: return f"  {C.YELLOW}⚠{C.RESET} {msg}"
def err(msg: str)   -> str: return f"  {C.RED}✗{C.RESET} {msg}"
def info(msg: str)  -> str: return f"  {C.CYAN}·{C.RESET} {msg}"
def kv(k: str, v: str, ancho_k: int = 30) -> str:
    return f"  {C.GREY}{k:<{ancho_k}}{C.RESET} {C.BOLD}{v}{C.RESET}"


def fmt_num(x: float, dec: int = 2) -> str:
    return f"{x:,.{dec}f}"

# ═══════════════════════════════════════════════════════════════════════════════
# SECCIÓN 4 — TABLAS DOCUMENTALES PROPORCIONADAS POR EL USUARIO
# ═══════════════════════════════════════════════════════════════════════════════

# Tabla 2 — Schedule 40 acero  [P3-pág.4]   (ID_in, wt_agua_lb_ft)
STEEL_SCH40: dict[str, tuple[float, float]] = {
    '1/2':   (0.622, 0.1316), '3/4':   (0.824, 0.2301),
    '1':     (1.049, 0.3740), '1-1/4': (1.380, 0.6471),
    '1-1/2': (1.610, 0.8820), '2':     (2.067, 1.4520),
    '2-1/2': (2.469, 2.0720), '3':     (3.068, 3.2000),
    '4':     (4.026, 5.5100), '5':     (5.047, 8.6600),
    '6':     (6.065, 12.5100),'8':     (7.981, 21.600),
    '10':    (10.020, 34.100),'12':    (11.938, 46.900),
    '14':    (13.250, 59.800),'16':    (15.250, 79.100),
    '18':    (17.250, 100.800),'20':   (19.250, 126.700),
    '24':    (23.250, 184.600),
}

# Tabla 3 — Type L copper  [P3-pág.5]
COPPER_L: dict[float, tuple[float, float]] = {
    0.375: (0.430, 0.063), 0.500: (0.545, 0.101),
    0.625: (0.785, 0.209), 0.750: (0.995, 0.336),
    0.875: (1.245, 0.526), 1.125: (1.905, 1.300),
    1.375: (2.435, 2.015), 1.625: (2.945, 2.975),
    2.125: (3.425, 4.000), 2.625: (3.905, 5.180),
    3.125: (4.875, 8.090), 4.125: (5.845, 11.610),
}

# Tabla 13 — Velocidades recomendadas  [P3-pág.23]
V_RECOMENDADA_FPS: dict[str, tuple[float, float]] = {
    'pump_discharge': (8, 12), 'pump_suction': (4, 7),
    'drain_line':     (4, 7),  'header':       (4, 15),
    'riser':          (3, 10), 'general':      (5, 10),
    'city_water':     (3, 7),
}

# Tabla 14 — Velocidad máx por erosión  [P3-pág.23]
EROSION_TABLA = [(1500, 15), (2000, 14), (3000, 13),
                 (4000, 12), (6000, 10), (8000, 8)]

# Tabla 11 — L_eq fittings (documental)  [P3-pág.19]
TABLE_11_LEQ: dict[str, dict[str, float]] = {
    '1/2':   {'ell90_RD1.1': 1.4, 'ell90_RD1.5': 0.9, 'ell45': 0.7,
              'tee_thru': 0.9, 'tee_branch': 2.7, 'tee_red': 1.4},
    '3/4':   {'ell90_RD1.1': 1.6, 'ell90_RD1.5': 1.0, 'ell45': 0.8,
              'tee_thru': 1.0, 'tee_branch': 3.0, 'tee_red': 1.6},
    '1':     {'ell90_RD1.1': 2.0, 'ell90_RD1.5': 1.4, 'ell45': 0.9,
              'tee_thru': 1.4, 'tee_branch': 4.0, 'tee_red': 2.0},
    '1-1/4': {'ell90_RD1.1': 2.6, 'ell90_RD1.5': 1.7, 'ell45': 1.3,
              'tee_thru': 1.7, 'tee_branch': 5.0, 'tee_red': 2.6},
    '1-1/2': {'ell90_RD1.1': 3.3, 'ell90_RD1.5': 2.3, 'ell45': 1.7,
              'tee_thru': 2.3, 'tee_branch': 7.0, 'tee_red': 3.3},
    '2':     {'ell90_RD1.1': 4.0, 'ell90_RD1.5': 2.6, 'ell45': 2.1,
              'tee_thru': 2.6, 'tee_branch': 8.0, 'tee_red': 4.0},
    '2-1/2': {'ell90_RD1.1': 5.0, 'ell90_RD1.5': 3.3, 'ell45': 2.6,
              'tee_thru': 3.3, 'tee_branch': 10.0, 'tee_red': 5.0},
    '3':     {'ell90_RD1.1': 6.0, 'ell90_RD1.5': 4.1, 'ell45': 3.2,
              'tee_thru': 4.1, 'tee_branch': 12.0, 'tee_red': 6.0},
    '4':     {'ell90_RD1.1': 9.0, 'ell90_RD1.5': 5.9, 'ell45': 4.7,
              'tee_thru': 5.9, 'tee_branch': 18.0, 'tee_red': 9.0},
    '5':     {'ell90_RD1.1': 10.0, 'ell90_RD1.5': 6.7, 'ell45': 5.2,
              'tee_thru': 6.7, 'tee_branch': 21.0, 'tee_red': 10.0},
    '6':     {'ell90_RD1.1': 13.0, 'ell90_RD1.5': 8.2, 'ell45': 6.5,
              'tee_thru': 8.2, 'tee_branch': 25.0, 'tee_red': 12.0},
    '8':     {'ell90_RD1.1': 16.0, 'ell90_RD1.5': 10.0, 'ell45': 7.9,
              'tee_thru': 10.0, 'tee_branch': 30.0, 'tee_red': 13.0},
    '10':    {'ell90_RD1.1': 20.0, 'ell90_RD1.5': 13.0, 'ell45': 10.0,
              'tee_thru': 12.0, 'tee_branch': 33.0, 'tee_red': 16.0},
    '12':    {'ell90_RD1.1': 25.0, 'ell90_RD1.5': 16.0, 'ell45': 13.0,
              'tee_thru': 14.0, 'tee_branch': 40.0, 'tee_red': 20.0},
}

# Reconstrucción de Examples 2/3  [P3-pág.31-32]
EXAMPLE_LEQ: dict[str, dict[str, float]] = {
    '1-1/4': {'ell90_RD1.1': 3.3, 'ell90_RD1.5': 2.3, 'ell45': 1.8,
              'tee_thru': 2.6, 'tee_branch': 5.0, 'tee_red': 3.3},
    '2':     {'ell90_RD1.1': 6.0, 'ell90_RD1.5': 4.0, 'ell45': 3.0,
              'tee_thru': 5.0, 'tee_branch': 8.0, 'tee_red': 7.5},
    '3':     {'ell90_RD1.1': 7.5, 'ell90_RD1.5': 5.0, 'ell45': 4.0,
              'tee_thru': 5.0, 'tee_branch': 12.0, 'tee_red': 9.0},
    '4':     {'ell90_RD1.1': 10.0, 'ell90_RD1.5': 6.7, 'ell45': 5.0,
              'tee_thru': 6.7, 'tee_branch': 18.0, 'tee_red': 9.0},
    '5':     {'ell90_RD1.1': 13.0, 'ell90_RD1.5': 8.2, 'ell45': 6.7,
              'tee_thru': 8.2, 'tee_branch': 21.0, 'tee_red': 12.0},
}

# Tabla 15 — Expansión del agua  [P3-pág.34]
WATER_EXPANSION_PCT: dict[int, float] = {
    100: 0.62, 125: 1.2, 150: 1.8, 175: 2.8, 200: 3.5,
    225: 4.5, 250: 5.6, 275: 6.81, 300: 8.3,
    325: 9.8, 350: 11.5, 375: 13.0, 400: 15.0,
}

# Tabla 7/8 — Spacing de soportes  [P3-pág.8]
SUPPORT_SPACING_STEEL = {
    '1/2': 8, '3/4': 8, '1': 8, '1-1/4': 8,
    '1-1/2': 10, '2': 10, '2-1/2': 12, '3': 12, '3-1/2': 12,
    '4': 14, '5': 14, '6': 14,
    '8': 16, '10': 16, '12': 16,
    '14': 20, '16': 20, '18': 20, '20': 20, '24': 20,
}

# Chart 6 — Diversidad  [P3-pág.30]
CHART_6 = [
    (0.00, 0.600), (0.10, 0.620), (0.20, 0.650),
    (0.28, 0.670), (0.40, 0.730), (0.43, 0.725),
    (0.50, 0.760), (0.57, 0.785), (0.60, 0.800),
    (0.70, 0.855), (0.80, 0.900), (0.90, 0.950),
    (1.00, 1.000),
]

# Caudal mínimo turbulento por circuito  [P12-pág.5]
GPM_MIN_TURBULENTO = {0.375: 0.5, 0.500: 0.7, 0.625: 0.9}

# ═══════════════════════════════════════════════════════════════════════════════
# SECCIÓN 5 — FUNCIONES PRIMITIVAS
# ═══════════════════════════════════════════════════════════════════════════════

def max_vel_erosion(horas: int) -> float:
    """Tabla 14 [P3-pág.23]."""
    return interpolar(horas, EROSION_TABLA)

def chart_6_interp(r: float) -> float:
    """Chart 6 [P3-pág.30]."""
    return interpolar(r, CHART_6)

def expansion_pct(T_F: float) -> float:
    """Tabla 15 [P3-pág.34]."""
    pts = sorted(WATER_EXPANSION_PCT.items())
    return interpolar(T_F, pts)



def delta_h_seccion(L_eq_ft: float, friction_rate: float = 10.0) -> float:
    """Δh [ft agua] = L_eq/100 · friction_rate [ft/100 ft]"""
    return numero(L_eq_ft, 'Leq') * numero(friction_rate, 'J') / 100.0

def volumen_agua_tuberia(nps: str, L_ft: float,
                          material: str = 'steel') -> float:
    if material != 'steel': raise ValueError('Cobre requiere catálogo verificado; la tabla original no se usa.')
    cat = STEEL_SCH40
    if nps not in cat:
        raise ValueError(f"NPS '{nps}' no encontrado para material {material}")
    _, wt = cat[nps]
    return numero(L_ft, 'Longitud') * wt / GAL_PER_LB_AGUA




# ═══════════════════════════════════════════════════════════════════════════════
# EXTENSIÓN THERMABOT — contrato, cálculo sin efectos laterales y diagnóstico
# Las tablas anteriores se conservan como fueron suministradas. No se atribuye
# validación independiente a sus transcripciones. No se ejecuta el motor térmico.
# ═══════════════════════════════════════════════════════════════════════════════
import copy
import os
import re
import tempfile
import unicodedata
from dataclasses import is_dataclass

SCHEMA = 'thermabot.carrier-water.v1'
POWER_TO_BTUH = {'BTU/h': 1.0, 'W': 3.412141633127942,
                'kW': 3412.141633127942, 'kcal/h': 3.968320719327}
PIPE_UNITS = {'1/2': .5, '3/4': .75, '1': 1., '1-1/4': 1.25,
              '1-1/2': 1.5, '2': 2., '2-1/2': 2.5, '3': 3., '4': 4.}
EPANET_SOURCE = 'https://www.epa.gov/system/files/documents/2021-07/epanet_users_manual_2.2.0-1.pdf'
ANSI_PALETTE = {k: v for k, v in vars(C).items() if k.isupper()}


def numero(value: Any, path: str, minimum: float = 0., *, positive=False) -> float:
    """Reject bool, coercion, NaN, infinity and invalid signs at the boundary."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{path}: se requiere un número, no texto/null/bool.')
    if not math.isfinite(value) or value < minimum or (positive and value <= 0):
        raise ValueError(f'{path}: valor finito fuera de rango ({value}).')
    return float(value)


def entero(value: Any, path: str, minimum=0) -> int:
    n = numero(value, path, minimum)
    if n != int(n):
        raise ValueError(f'{path}: debe ser entero.')
    return int(n)


def texto(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'{path}: texto obligatorio.')
    if any(ord(c) < 32 for c in value):
        raise ValueError(f'{path}: no se permiten caracteres de control.')
    return value.strip()


def convertir_potencia(value: Any, unit: str) -> float:
    if unit not in POWER_TO_BTUH:
        raise ValueError(f'Unidad de potencia no soportada: {unit!r}.')
    return numero(value, 'carga') * POWER_TO_BTUH[unit]


def interpolar(x: float, tabla: Sequence[tuple[float, float]]) -> float:
    """Linear interpolation with an explicit domain; never clamp/extrapolate."""
    numero(x, 'interpolación')
    if len(tabla) < 2 or any(b[0] <= a[0] for a, b in zip(tabla, tabla[1:])):
        raise ValueError('Tabla vacía o abscisas no estrictamente crecientes.')
    if not tabla[0][0] <= x <= tabla[-1][0]:
        raise ValueError(f'Valor {x} fuera del dominio tabulado {tabla[0][0]}…{tabla[-1][0]}.')
    for (x1, y1), (x2, y2) in zip(tabla, tabla[1:]):
        if x1 <= x <= x2:
            return y1 + (y2-y1)*(x-x1)/(x2-x1)
    raise ValueError('No se pudo interpolar.')


def velocidad_fps(gpm: float, id_in: float) -> float:
    """Exact US gallon conversion: Q·231/60 divided by circular area in²."""
    return numero(gpm, 'GPM') * 231 / 60 / (math.pi * numero(id_in, 'ID', positive=True)**2 / 4) / 12


def L_eq(nps: str, L_recta: float, fittings: dict[str, int], tabla='table11') -> float:
    """Straight pipe + fitting equivalents [P3-pág.19], no guessed fittings."""
    if tabla not in ('table11', 'example'):
        raise ValueError('Tabla de fittings inválida.')
    cat = TABLE_11_LEQ if tabla == 'table11' else EXAMPLE_LEQ
    total = numero(L_recta, 'L recta')
    for kind, count in fittings.items():
        count = entero(count, 'fittings.'+kind)
        if count == 0:
            continue
        if nps not in cat or kind not in cat[nps]:
            raise ValueError(f'No hay L_eq documental para {nps}/{kind}.')
        total += cat[nps][kind] * count
    return total


def spacing_soporte(nps: str, material='steel') -> int:
    if material != 'steel' or nps not in SUPPORT_SPACING_STEEL:
        raise ValueError('Separación de soportes no suministrada [P3-pág.8].')
    return SUPPORT_SPACING_STEEL[nps]


@dataclass
class Espacio:
    id: str
    exposicion: str
    Q_total_btuh: float
    Q_sensible_btuh: float
    Q_calef_btuh: float
    nombre: str = ''
    CFM_ventilacion: float = 0.
    perfil_frio: list[dict] = field(default_factory=list)
    procedencia: dict = field(default_factory=dict)


@dataclass
class CondicionesDiseno:
    T_OA_verano_F: float = 95.
    T_OA_invierno_F: float = 35.
    T_interior_verano_F: float = 75.
    T_interior_invierno_F: float = 70.
    T_agua_frio_F: float = 45.
    T_agua_caliente_F: float = 140.
    delta_T_agua_F: float = 10.
    horas_operacion_anual: int = 6000
    friction_rate_diseno: float = 10.
    delta_T_calef_F: Optional[float] = None  # legacy ΔT applies to both if absent
    rugosidad_ft: Optional[float] = None
    viscosidad_frio_ft2_s: Optional[float] = None
    viscosidad_calef_ft2_s: Optional[float] = None
    fuente_fluido: str = ''
    fluido: str = 'water'  # factor 500 is not silently applied to glycol


@dataclass
class ModeloFCU:
    codigo: str
    Q_tot_nom_btuh: float
    Q_sens_nom_btuh: float
    CFM_nom: float
    GPM_nom: float
    OD_tubo_in: float
    N_circuitos: int
    dP_agua_psi: float = 0.
    dP_aire_inH2O: float = 0.
    Q_calef_nom_btuh: Optional[float] = None
    GPM_calef_nom: Optional[float] = None
    dP_calef_psi: Optional[float] = None
    gpm_min_circuito: Optional[float] = None
    fuente: str = ''
    condiciones_verificadas: bool = False
    condiciones: dict = field(default_factory=dict)


@dataclass
class Seccion:
    id: str
    nps: Optional[str]
    L_recta_ft: float
    tipo: str = 'general'
    fittings: dict[str, int] = field(default_factory=dict)
    exposiciones_servidas: list[str] = field(default_factory=list)
    gpm_diseno: float = 0.
    v_fps: float = 0.
    L_eq_ft: float = 0.
    dh_ft: float = 0.
    nps_sugerido: Optional[str] = None
    espacios_servidos: list[str] = field(default_factory=list)
    friction_rate_verificado: Optional[float] = None
    friction_rate_calef_verificado: Optional[float] = None
    referencia_gpm: Optional[float] = None
    referencia_calef_gpm: Optional[float] = None
    referencia_nps: Optional[str] = None
    fuente_friccion: str = ''
    gpm_frio: float = 0.
    gpm_calef: float = 0.
    dh_frio_ft: float = 0.
    dh_calef_ft: float = 0.
    friccion_frio: dict = field(default_factory=dict)
    friccion_calef: dict = field(default_factory=dict)
    direccion: Optional[str] = None  # explicit supply/return, never inferred from ID


@dataclass
class Layout:
    tipo: str = 'reverse_return'
    orden_exposiciones: list[str] = field(default_factory=list)
    secciones: list[Seccion] = field(default_factory=list)
    circuitos: list[dict] = field(default_factory=list)
    diversidad: str = 'chart6'  # sin_diversidad | coincidente | chart6


@dataclass
class Proyecto:
    nombre: str = 'Proyecto sin nombre'
    autor: str = ''
    fecha: str = ''
    id: str = ''


@dataclass
class ConfiguracionTanque:
    volumen_equipos_gal: Optional[float] = None
    E: Optional[float] = None  # net volumetric expansion fraction, explicit source
    P_a: Optional[float] = None  # dimensionless gas-volume coefficient, not psig
    P_f: Optional[float] = None
    fuente: str = ''


@dataclass
class SistemaAgua:
    proyecto: Proyecto = field(default_factory=Proyecto)
    condiciones: CondicionesDiseno = field(default_factory=CondicionesDiseno)
    espacios: list[Espacio] = field(default_factory=list)
    layout: Layout = field(default_factory=Layout)
    catalogo_fcu: list[ModeloFCU] = field(default_factory=list)
    tabla_leq: str = 'table11'
    material: str = 'steel'
    tanque: ConfiguracionTanque = field(default_factory=ConfiguracionTanque)
    tuberias: dict[str, dict] = field(default_factory=dict)
    procedencia: dict = field(default_factory=dict)


@dataclass
class Diagnostico:
    errores: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)

    def error(self, msg): self.errores.append(str(msg))
    def warn(self, msg): self.warnings.append(str(msg))
    def nota(self, msg): self.info.append(str(msg))
    @property
    def ok(self): return not self.errores
    @property
    def tiene_warnings(self): return bool(self.warnings)


def _trace(eq, inputs, result, unit, source):
    return {'ecuacion': eq, 'entradas': inputs, 'resultado': result,
            'unidad': unit, 'fuente': source}


def _pipe_catalog(sis):
    if sis.tuberias:
        for nps, row in sis.tuberias.items():
            texto(nps, 'tuberías.NPS')
            diameter = numero(row['id_in'], 'tubería.ID', positive=True)
            if 'od_in' in row and diameter >= numero(row['od_in'], 'tubería.OD', positive=True):
                raise ValueError('Diámetro interior debe ser menor al exterior.')
            numero(row['wt_agua_lb_ft'], 'tubería.peso de agua', positive=True)
            numero(row['spacing_ft'], 'tubería.soportes', positive=True)
            texto(row['fuente'], 'tubería.fuente')
        return sis.tuberias
    if sis.material == 'copper':
        raise ValueError('Cobre: suministrá tuberias con ID/OD y soportes verificados. '
                         'La transcripción original contiene ID > OD y no incluye Tabla 8.')
    return {nps: {'id_in': row[0], 'wt_agua_lb_ft': row[1],
                 'spacing_ft': spacing_soporte(nps), 'fuente': '[P3-pág.4/8] · transcripción suministrada'}
            for nps, row in STEEL_SCH40.items()}


def validar_entrada(sis):
    """Structural and physical checks before any sizing; no silent defaults."""
    def walk(v, path='entrada'):
        if is_dataclass(v): walk(asdict(v), path)
        elif isinstance(v, dict):
            for k, item in v.items(): walk(item, path+'.'+str(k))
        elif isinstance(v, list):
            for i, item in enumerate(v): walk(item, f'{path}[{i}]')
        elif isinstance(v, float) and not math.isfinite(v):
            raise ValueError(path+': NaN/Infinity no permitidos.')
    walk(sis)
    texto(sis.proyecto.nombre, 'proyecto.nombre')
    if not sis.espacios: raise ValueError('No hay espacios cargados.')
    if sis.material not in ('steel', 'copper'): raise ValueError('Material no soportado.')
    _pipe_catalog(sis)
    c=sis.condiciones
    for key in ('T_OA_verano_F','T_OA_invierno_F','T_interior_verano_F','T_interior_invierno_F'):
        value=getattr(c,key)
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<=-459.67:
            raise ValueError(key+': temperatura absoluta inválida.')
    if c.fluido != 'water': raise ValueError('Factor 500 solo para agua. Glicol no soportado.')
    numero(c.delta_T_agua_F, 'ΔT frío', positive=True)
    if c.delta_T_calef_F is not None: numero(c.delta_T_calef_F, 'ΔT caliente', positive=True)
    entero(c.horas_operacion_anual, 'horas operación', 1)
    max_vel_erosion(c.horas_operacion_anual)
    numero(c.friction_rate_diseno, 'fricción máxima de diseño', positive=True)
    for key in ('T_agua_frio_F','T_agua_caliente_F'):
        t=getattr(c,key)
        if isinstance(t,bool) or not isinstance(t,(int,float)) or not math.isfinite(t) or not 32<t<212:
            raise ValueError(key+': agua líquida 32…212 °F requerida para este modelo.')
    ids=set()
    for e in sis.espacios:
        if texto(e.id,'espacio.id') in ids: raise ValueError('ID de espacio duplicado: '+e.id)
        ids.add(e.id)
        texto(e.exposicion, 'espacio.exposición')
        for k in ('Q_total_btuh','Q_sensible_btuh','Q_calef_btuh','CFM_ventilacion'):
            numero(getattr(e,k), e.id+'.'+k)
        if e.Q_sensible_btuh>e.Q_total_btuh+1e-8:
            raise ValueError(e.id+': sensible mayor a total.')
        air=e.procedencia.get('condiciones_aire',{})
        for season, row in air.items():
            for key in ('temperatura_C','bulbo_humedo_C'):
                if row.get(key) is not None:
                    v=row[key]
                    if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<=-273.15:
                        raise ValueError(e.id+': condición de aire inválida.')
            if row.get('rh_pct') is not None and numero(row['rh_pct'],'RH')>100:
                raise ValueError(e.id+': RH fuera de 0…100%.')
        hours=set()
        for h in e.perfil_frio:
            hour=entero(h['hour'],e.id+'.hora')
            if hour>23 or hour in hours: raise ValueError(e.id+': hora repetida o fuera de 0…23.')
            hours.add(hour)
            numero(h['total_btuh'],e.id+'.perfil total')
            sensible=numero(h['sensible_btuh'],e.id+'.perfil sensible')
            if sensible>h['total_btuh']+1e-8: raise ValueError(e.id+': perfil sensible > total.')
        if e.perfil_frio and (not math.isclose(max(h['total_btuh'] for h in e.perfil_frio),e.Q_total_btuh,rel_tol=1e-8)
                              or not math.isclose(max(h['sensible_btuh'] for h in e.perfil_frio),e.Q_sensible_btuh,rel_tol=1e-8)):
            raise ValueError(e.id+': máximos y perfil horario no coinciden.')
    if sis.layout.tipo not in ('direct_return','reverse_return'): raise ValueError('Layout inválido.')
    if sis.layout.diversidad not in ('chart6','coincidente','sin_diversidad'): raise ValueError('Diversidad inválida.')
    order=sis.layout.orden_exposiciones
    if len(order)!=len(set(order)): raise ValueError('Orden de exposiciones repetido.')
    if sis.layout.diversidad=='chart6' and set(order)!={e.exposicion for e in sis.espacios}:
        raise ValueError('El orden debe incluir exactamente todas las exposiciones.')
    sec_ids=set()
    for sec in sis.layout.secciones:
        if texto(sec.id,'sección.id') in sec_ids: raise ValueError('ID de sección duplicado.')
        sec_ids.add(sec.id)
        numero(sec.L_recta_ft, sec.id+'.longitud', positive=True)
        numero(sec.gpm_diseno,sec.id+'.GPM')
        if sec.tipo not in V_RECOMENDADA_FPS: raise ValueError('Tipo de sección no tabulado: '+sec.tipo)
        if sec.espacios_servidos and sec.exposiciones_servidas:
            raise ValueError(sec.id+': declarár espacios o exposiciones, no ambas listas.')
        for name, count in sec.fittings.items(): texto(name,'fitting');entero(count,'cantidad fitting')
        if len(sec.espacios_servidos)!=len(set(sec.espacios_servidos)) or not set(sec.espacios_servidos)<=ids:
            raise ValueError(sec.id+': espacios inexistentes o repetidos.')
        if len(sec.exposiciones_servidas)!=len(set(sec.exposiciones_servidas)) or not set(sec.exposiciones_servidas)<={e.exposicion for e in sis.espacios}:
            raise ValueError(sec.id+': exposiciones inexistentes o repetidas.')
    if not sis.layout.secciones: raise ValueError('Falta el trazado de tuberías.')
    codes=set()
    for m in sis.catalogo_fcu:
        if texto(m.codigo,'FCU.codigo') in codes: raise ValueError('Modelo FCU duplicado.')
        codes.add(m.codigo)
        for k in ('Q_tot_nom_btuh','Q_sens_nom_btuh','CFM_nom','GPM_nom','OD_tubo_in'):
            numero(getattr(m,k),m.codigo+'.'+k,positive=True)
        if m.Q_sens_nom_btuh>m.Q_tot_nom_btuh: raise ValueError('FCU sensible > total.')
        entero(m.N_circuitos,m.codigo+'.circuitos',1)
        numero(m.dP_agua_psi,m.codigo+'.ΔP')
        numero(m.dP_aire_inH2O,m.codigo+'.ΔP aire')
        for key in ('Q_calef_nom_btuh','GPM_calef_nom','gpm_min_circuito'):
            if getattr(m,key) is not None:numero(getattr(m,key),m.codigo+'.'+key,positive=True)
        if m.dP_calef_psi is not None:numero(m.dP_calef_psi,m.codigo+'.ΔP caliente')
        if not isinstance(m.condiciones,dict) or not isinstance(m.condiciones_verificadas,bool):
            raise ValueError(m.codigo+': condiciones de catálogo inválidas.')


def paso_1_cargas(sis, diag):
    """[P12-pág.6] Overcooling once, at plant capacity, never on FCU loads."""
    suma=sum(e.Q_total_btuh for e in sis.espacios)
    if any('DEMO' in m.fuente.upper() or 'SINTÉTIC' in m.fuente.upper() for m in sis.catalogo_fcu):
        diag.warn('DATOS SINTÉTICOS: prueba de software, no selección de fabricante ni diseño para obra.')
    if sis.procedencia.get('revision',{}).get('revisado') is False:
        diag.warn('Balance preliminar: hay entradas térmicas sin revisar. No usar para selección definitiva.')
    profiles=[e.perfil_frio for e in sis.espacios]
    block=suma; hour=None
    if all(profiles):
        domains=[{h['hour'] for h in p} for p in profiles]
        if any(d!=domains[0] for d in domains): raise ValueError('Perfiles con dominios horarios distintos.')
        sums={h:sum(next(v['total_btuh'] for v in p if v['hour']==h) for p in profiles) for h in sorted(domains[0])}
        hour=max(sums,key=sums.get);block=sums[hour]
    elif any(profiles): raise ValueError('Perfiles incompletos: todos los espacios deben aportar la misma base temporal.')
    else: diag.warn('Sin perfiles: carga de bloque conservadora = suma de máximos; no es un pico coincidente verificado.')
    if block<=0: raise ValueError('No hay carga de refrigeración positiva.')
    heat=sum(e.Q_calef_btuh for e in sis.espacios)
    return {'Q_bloque_btuh':block,'Q_refrig_btuh':FACTOR_OVERCOOL*block,
            'Q_refrig_ton':FACTOR_OVERCOOL*block/12000,'Q_calef_btuh':heat,
            'n_espacios':len(sis.espacios),'suma_maximos_btuh':suma,'hora_bloque':hour,
            'trace':_trace('Q_refrig=1.05·Q_bloque',{'Q_bloque':block},FACTOR_OVERCOOL*block,'BTU/h','[P12-pág.6]')}


def paso_2_caudales(sis, diag, cargas):
    """Separate winter/summer flows; reversible two-pipe system, not their sum."""
    cold=sis.condiciones.delta_T_agua_F;hot=sis.condiciones.delta_T_calef_F or cold
    if sis.condiciones.delta_T_calef_F is None and cargas['Q_calef_btuh']:
        diag.warn('ΔT caliente usa el ΔT legado; confirmalo para calefacción.')
    cf={e.id:e.Q_total_btuh/(FACTOR_500*cold) for e in sis.espacios}
    hf={e.id:e.Q_calef_btuh/(FACTOR_500*hot) for e in sis.espacios}
    return {'gpm_por_zona':cf,'gpm_calef_por_zona':hf,
            'gpm_total_sin_div':sum(cf.values()),'gpm_total_calef':sum(hf.values()),
            'delta_T_F':cold,'delta_T_calef_F':hot,
            'trace':_trace('GPM=Q/(500·ΔT)',{'delta_T_frio_F':cold,'delta_T_calef_F':hot,
                'cargas_btuh':{e.id:{'frio':e.Q_total_btuh,'calef':e.Q_calef_btuh} for e in sis.espacios}},
                {'frio':cf,'calef':hf},'gpm','[P12-pág.5]')}


def paso_3_seleccion_fcu(sis, diag, caudales):
    """Catalog capacities apply only at declared design and nominal water flow."""
    if not sis.catalogo_fcu: raise ValueError('Falta catálogo de fan-coils a condiciones de diseño.')
    selected={};operating={};heat_flow={};checks={}
    for e in sis.espacios:
        failures=[];chosen=None
        air=e.procedencia.get('condiciones_aire',{})
        summer_air=air.get('verano',{});winter_air=air.get('invierno',{})
        room_summer=(summer_air['temperatura_C']*9/5+32) if 'temperatura_C' in summer_air else sis.condiciones.T_interior_verano_F
        room_winter=(winter_air['temperatura_C']*9/5+32) if 'temperatura_C' in winter_air else sis.condiciones.T_interior_invierno_F
        wet=summer_air.get('bulbo_humedo_C')
        if not air:diag.warn(e.id+': contrato sin condiciones de aire del balance; corroborar ficha FCU con el diseño térmico.')
        for m in sorted(sis.catalogo_fcu,key=lambda x:x.Q_tot_nom_btuh):
            minimum=m.gpm_min_circuito if m.gpm_min_circuito is not None else GPM_MIN_TURBULENTO.get(m.OD_tubo_in)
            cond=m.condiciones
            c=sis.condiciones
            design=(m.condiciones_verificadas and bool(m.fuente.strip()) and
                    cond.get('T_agua_frio_F')==c.T_agua_frio_F and
                    isinstance(cond.get('T_interior_verano_F'),(int,float)) and abs(cond['T_interior_verano_F']-room_summer)<=.1 and
                    (wet is None or (isinstance(cond.get('T_bh_interior_verano_F'),(int,float)) and abs(cond['T_bh_interior_verano_F']-(wet*9/5+32))<=.1)) and
                    bool(cond.get('fuente_psicrometrica')))
            heat_ok=(not e.Q_calef_btuh or (m.Q_calef_nom_btuh is not None and m.GPM_calef_nom is not None
                       and m.dP_calef_psi is not None and m.Q_calef_nom_btuh>=e.Q_calef_btuh
                       and m.GPM_calef_nom>=caudales['gpm_calef_por_zona'][e.id]
                       and cond.get('T_agua_caliente_F')==c.T_agua_caliente_F
                       and isinstance(cond.get('T_interior_invierno_F'),(int,float)) and abs(cond['T_interior_invierno_F']-room_winter)<=.1))
            if (design and heat_ok and minimum is not None and
                m.Q_tot_nom_btuh>=e.Q_total_btuh and m.Q_sens_nom_btuh>=e.Q_sensible_btuh and
                m.GPM_nom>=caudales['gpm_por_zona'][e.id] and m.GPM_nom/m.N_circuitos>=minimum and
                (not e.Q_calef_btuh or m.GPM_calef_nom/m.N_circuitos>=minimum)):
                chosen=m;break
            failures.append(m.codigo)
        selected[e.id]=chosen
        if chosen is None:
            diag.error(e.id+': ningún FCU cumple total/sensible/calefacción/caudal/turbulencia y condiciones verificadas.')
            continue
        operating[e.id]=chosen.GPM_nom
        heat_flow[e.id]=chosen.GPM_calef_nom if e.Q_calef_btuh else 0.
        checks[e.id]={'gpm_por_circuito':chosen.GPM_nom/chosen.N_circuitos,
                      'fuente':chosen.fuente,'condiciones':chosen.condiciones}
    return {'selecciones':selected,'sin_catalogo':False,'gpm_operacion':operating,
            'gpm_calef_operacion':heat_flow,'verificacion':checks,
            'trace':_trace('Qcat≥Q; GPMnom/N≥GPMmín',{'cargas':{e.id:{'total_btuh':e.Q_total_btuh,'sensible_btuh':e.Q_sensible_btuh,'calef_btuh':e.Q_calef_btuh} for e in sis.espacios},
                'catalogo':[asdict(m) for m in sis.catalogo_fcu]},checks,'BTU/h; gpm','[P12-pág.4/5] + catálogo ingresado')}


def paso_4_diversidad(sis, diag, caudales, fcu=None):
    """[P3-pág.27/30] Final exposure unreduced; never apply diversity twice."""
    flows=dict(caudales['gpm_por_zona']);hot=dict(caudales['gpm_calef_por_zona'])
    if fcu:
        flows.update(fcu['gpm_operacion']);hot.update(fcu['gpm_calef_operacion'])
    total=sum(flows.values());order=sis.layout.orden_exposiciones
    factors={e.exposicion:1. for e in sis.espacios};rows=[]
    if sis.layout.diversidad=='coincidente':
        if fcu and any(not math.isclose(flows[e.id],caudales['gpm_por_zona'][e.id],rel_tol=1e-8) for e in sis.espacios):
            raise ValueError('Diversidad coincidente requiere catálogo/curvas a caudal térmico; no reduce caudal nominal fijo del FCU.')
        if not all(e.perfil_frio for e in sis.espacios): raise ValueError('Diversidad coincidente exige perfiles de todos los espacios.')
        domains=[{h['hour'] for h in e.perfil_frio} for e in sis.espacios]
        if any(d!=domains[0] for d in domains):raise ValueError('Horas de perfiles incompatibles.')
        pump=max(sum(next(h['total_btuh'] for h in e.perfil_frio if h['hour']==hour)/(500*sis.condiciones.delta_T_agua_F)
                     for e in sis.espacios) for hour in domains[0])
    elif sis.layout.diversidad=='chart6' and len(order)>1:
        acc=0.
        for i, exp in enumerate(order):
            g=sum(flows[e.id] for e in sis.espacios if e.exposicion==exp);acc+=g
            factor=1. if i==len(order)-1 else chart_6_interp(acc/total)
            factors[exp]=factor
            rows.append({'idx':i,'exposicion':exp,'gpm_max':g,'gpm_acum':acc,
                         'ratio':acc/total,'F_div':factor,'gpm_diseño':g*factor})
        pump=sum(r['gpm_diseño'] for r in rows)
    else:
        pump=total
        diag.nota('Sin reducción por diversidad: caudales completos.')
    return {'exposiciones':rows,'gpm_bomba':max(pump,sum(hot.values())),
            'gpm_bomba_frio':pump,'gpm_bomba_calef':sum(hot.values()),
            'gpm_total_sin_div':total,'reduccion_pct':100*(1-pump/total),
            'factores':factors,'gpm_zona_por_id':flows,'gpm_calef_zona_por_id':hot,
            'modo':sis.layout.diversidad,
            'trace':_trace('Σ GPM_exposición·F; Fúltima=1',{},rows,'gpm','[P3-pág.27/30]')}


def _served(sis, sec):
    return [e for e in sis.espacios if (e.id in sec.espacios_servidos if sec.espacios_servidos
            else e.exposicion in sec.exposiciones_servidas if sec.exposiciones_servidas else True)]


def _friction(sis, sec, gpm, diameter, season):
    """Actual losses, not the design ceiling. Darcy–Weisbach auxiliary: EPA 2.2.

    Manual friction rates require a source plus the exact rated GPM and NPS.
    Darcy input viscosity/roughness must be explicitly supplied, never guessed.
    Transition Reynolds numbers require a verified manual rate.
    """
    if not gpm:return {'rate':0.,'Re':0.,'f':None,'fuente':'Sin circulación en esta estación'}
    rate=sec.friction_rate_verificado if season=='frio' else sec.friction_rate_calef_verificado
    ref=sec.referencia_gpm if season=='frio' else sec.referencia_calef_gpm
    if rate is not None:
        numero(rate,'Fracción fricción',positive=True);texto(sec.fuente_friccion,'Fuente fricción')
        if sec.referencia_nps!=sec.nps or ref is None or not math.isclose(gpm,ref,rel_tol=1e-8):
            raise ValueError(sec.id+': fricción manual no corresponde a NPS/GPM de diseño.')
        return {'rate':rate,'Re':None,'f':None,'fuente':sec.fuente_friccion}
    c=sis.condiciones
    nu=c.viscosidad_frio_ft2_s if season=='frio' else c.viscosidad_calef_ft2_s
    nu=numero(nu,'Viscosidad cinemática '+season,positive=True)
    rough=numero(c.rugosidad_ft,'Rugosidad');texto(c.fuente_fluido,'Fuente fluido/rugosidad')
    d=diameter/12;v=velocidad_fps(gpm,diameter);reynolds=v*d/nu
    if reynolds<=2000: f=64/reynolds
    elif reynolds>=4000: f=.25/(math.log10(rough/(3.7*d)+5.74/reynolds**.9)**2)
    else:raise ValueError(sec.id+': régimen transitorio; ingresá fricción verificada para NPS/GPM.')
    rate=f/d*v*v/(2*G_FPS2)*100
    return {'rate':rate,'Re':reynolds,'f':f,'fuente':EPANET_SOURCE,
            'trace':_trace('h=f·L/D·v²/(2g)',{'D_ft':d,'ν_ft²/s':nu,'ε_ft':rough,'v_fps':v},rate,'ft/100 ft',EPANET_SOURCE)}


def _seleccionar_diametro(gpm, servicio, horas, material='steel'):
    if material!='steel': raise ValueError('Cobre requiere catálogo de tubería verificado.')
    limit=min(V_RECOMENDADA_FPS[servicio][1],max_vel_erosion(horas))
    return next((nps for nps,(diameter,_) in STEEL_SCH40.items() if velocidad_fps(gpm,diameter)<=limit),None)


def paso_5_dimensionamiento(sis, diag, diversidad):
    cat=_pipe_catalog(sis);sections=[]
    for sec in sis.layout.secciones:
        served=_served(sis,sec)
        if sis.layout.diversidad=='coincidente':
            hours=sorted({h['hour'] for h in served[0].perfil_frio})
            cold=max(sum(next(h['total_btuh'] for h in e.perfil_frio if h['hour']==hour)/(500*sis.condiciones.delta_T_agua_F)
                         for e in served) for hour in hours)
        else:
            # Diversity applies to distribution headers/risers, never terminal runouts.
            terminal=len(served)==1 or sec.tipo=='runout'
            cold=sum(diversidad['gpm_zona_por_id'][e.id]*(1. if terminal else diversidad['factores'][e.exposicion]) for e in served)
        hot=sum(diversidad['gpm_calef_zona_por_id'][e.id] for e in served)
        demand=max(cold,hot)
        if sec.gpm_diseno and sec.gpm_diseno+1e-8<demand:
            raise ValueError(sec.id+': GPM ingresado menor al caudal requerido.')
        if sec.gpm_diseno>demand+1e-8:
            raise ValueError(sec.id+': override mayor al caudal de red; revisá balance hidráulico, no se inventa caudal de bypass.')
        sec.gpm_frio=cold;sec.gpm_calef=hot;sec.gpm_diseno=demand
        if not demand:raise ValueError(sec.id+': tramo sin carga/caudal.')
        candidates=[sec.nps] if sec.nps not in (None,'','auto') else sorted(cat,key=lambda n:cat[n]['id_in'])
        limit=min(V_RECOMENDADA_FPS[sec.tipo][1],max_vel_erosion(sis.condiciones.horas_operacion_anual))
        accepted=False;last_error=''
        for nps in candidates:
            if nps not in cat:raise ValueError('Diámetro no disponible: '+str(nps))
            sec.nps=nps;diameter=cat[nps]['id_in']
            if velocidad_fps(demand,diameter)>limit:
                last_error='velocidad supera recomendación/erosión';continue
            try:

                cf=_friction(sis,sec,cold,diameter,'frio');hf=_friction(sis,sec,hot,diameter,'calef')
            except ValueError as ex:
                last_error=str(ex)
                if 'transitorio' in last_error:continue
                raise
            if max(cf['rate'],hf['rate'])>sis.condiciones.friction_rate_diseno:
                last_error='pérdida unitaria supera criterio de diseño';continue
            accepted=True;sec.friccion_frio=cf;sec.friccion_calef=hf;break
        if not accepted:raise ValueError(sec.id+': ningún diámetro válido ('+last_error+').')
        if len(candidates)>1:sec.nps_sugerido=sec.nps
        sec.v_fps=velocidad_fps(demand,cat[sec.nps]['id_in'])
        if sec.v_fps<V_RECOMENDADA_FPS[sec.tipo][0]:diag.warn(sec.id+': velocidad menor a recomendación de Tabla 13.')
        if sis.material=='copper':
            fittings=cat[sec.nps].get('leq_fittings_ft',{})
            sec.L_eq_ft=sec.L_recta_ft
            for kind,count in sec.fittings.items():
                if count:
                    if kind not in fittings:raise ValueError('Cobre: falta L_eq documentada para '+kind)
                    sec.L_eq_ft+=numero(fittings[kind],'Leq cobre',positive=True)*count
        else:sec.L_eq_ft=L_eq(sec.nps,sec.L_recta_ft,sec.fittings,sis.tabla_leq)
        sec.dh_frio_ft=delta_h_seccion(sec.L_eq_ft,sec.friccion_frio['rate'])
        sec.dh_calef_ft=delta_h_seccion(sec.L_eq_ft,sec.friccion_calef['rate'])
        sec.dh_ft=max(sec.dh_frio_ft,sec.dh_calef_ft)
        sections.append(sec)
    return {'secciones':sections,'trace':_trace('Leq=L+Σ n·Leq_fitting; Δh=Leq·J/100',{},
            [asdict(s) for s in sections],'ft; gpm; fps','[P3-pág.19/23] + fricción verificada/Darcy')}


def paso_6_bomba(sis, diag, dim, diversidad, fcu=None):
    """[P3-pág.33] Critical supply+return path, including equipment, no safety factor."""
    by_id={s.id:s for s in dim['secciones']}
    if not sis.layout.circuitos:raise ValueError('Definí circuitos completos ida+retorno y pérdidas de equipos para calcular bomba.')
    covered=set();paths=[];names=set()
    for route in sis.layout.circuitos:
        rid=texto(route['id'],'circuito.id')
        if rid in names:raise ValueError('Circuito repetido: '+rid)
        names.add(rid);ids=route['secciones']
        if not ids or len(ids)!=len(set(ids)) or not set(ids)<=set(by_id):raise ValueError(rid+': secciones repetidas/ausentes.')
        directions={by_id[s].direccion for s in ids}
        if directions!={'ida','retorno'}:raise ValueError(rid+': declarár dirección ida/retorno en cada tramo y un circuito completo de ambas.')
        covered.update(ids)
        extra=numero(route['perdidas_equipo_ft'],rid+'.equipos frío')
        extra_hot=numero(route['perdidas_equipo_calef_ft'],rid+'.equipos caliente')
        texto(route['fuente_perdidas'],rid+'.fuente pérdidas')
        eid=route['espacio_id']
        if not fcu or eid not in fcu['selecciones'] or fcu['selecciones'][eid] is None:raise ValueError(rid+': FCU terminal sin selección válida.')
        m=fcu['selecciones'][eid]
        for sid in ids:
            if eid not in {e.id for e in _served(sis,by_id[sid])}:raise ValueError(rid+': tramo no sirve al terminal '+eid)
        cold=sum(by_id[i].dh_frio_ft for i in ids)+extra+m.dP_agua_psi*PSI_TO_FT_H2O
        active_hot=next(e.Q_calef_btuh for e in sis.espacios if e.id==eid)>0
        hot=(sum(by_id[i].dh_calef_ft for i in ids)+extra_hot+(m.dP_calef_psi or 0.)*PSI_TO_FT_H2O) if active_hot else 0.
        paths.append({'id':rid,'espacio_id':eid,'H_frio_ft':cold,'H_calef_ft':hot,'secciones':ids})
    if covered!=set(by_id):raise ValueError('Hay tramos no incluidos en ningún circuito de bomba.')
    if {p['espacio_id'] for p in paths}!={e.id for e in sis.espacios}:raise ValueError('Faltan circuitos terminales de uno o más espacios.')
    cold=max(p['H_frio_ft'] for p in paths);hot=max(p['H_calef_ft'] for p in paths);head=max(cold,hot)
    return {'Q_gpm':diversidad['gpm_bomba'],'H_ft':head,'H_psi':head/PSI_TO_FT_H2O,
            'frio':{'Q_gpm':diversidad['gpm_bomba_frio'],'H_ft':cold},
            'calef':{'Q_gpm':diversidad['gpm_bomba_calef'],'H_ft':hot},'detalle':paths,
            'nota':'Puntos de operación por estación; sin safety factor. No se selecciona fabricante sin curva.',
            'trace':_trace('H=max_circuito(Σh_ida+retorno+h_equipos+h_FCU)',{'circuitos':sis.layout.circuitos,
                'perdidas_fcu_psi':{id:{'frio':m.dP_agua_psi,'calef':m.dP_calef_psi} for id,m in fcu['selecciones'].items()}},paths,'ft agua','[P3-pág.33]')}


def paso_7_tanque(sis, diag, dim):
    """[P3-pág.34] Vt=E·Vs/(Pa−Pf). Pa/Pf must be dimensionless coefficients.

    No default pressure, no guessed equipment volume, no abs() of invalid output.
    Raw psig/psia/ft-water are NOT acceptable Pa/Pf for this volumetric expression.
    An engineer must supply the coefficient definition/source of their tank model.
    """
    t=sis.tanque;cat=_pipe_catalog(sis)
    pipes=sum(s.L_recta_ft*cat[s.nps]['wt_agua_lb_ft']/GAL_PER_LB_AGUA for s in dim['secciones'])
    equipment=numero(t.volumen_equipos_gal,'Volumen real de equipos')
    e=numero(t.E,'E expansión volumétrica',positive=True)
    if e>=1:raise ValueError('E debe ser fracción volumétrica, no porcentaje.')
    a=numero(t.P_a,'Pa adimensional',positive=True);f=numero(t.P_f,'Pf adimensional')
    if not 0<=f<a<=1:raise ValueError('Tanque: se requiere 0≤Pf<Pa≤1, coeficientes adimensionales; no presiones físicas.')
    texto(t.fuente,'Fuente de E/Pa/Pf y volumen de equipos')
    diag.warn('Tanque: Pa/Pf son coeficientes adimensionales ingresados; verificar su definición con el documento/fabricante. No introducir presiones en psi.')
    diag.nota('Volumen de equipos declarado debe incluir accesorios, baterías y equipos; no se aproxima como múltiplo de tuberías.')
    volume=pipes+equipment;result=e*volume/(a-f)
    return {'V_sist_tuberia_gal':pipes,'V_equipos_gal':equipment,'V_sist_total_gal':volume,
            'V_tanque_gal':result,'P_a':a,'P_f':f,'E_pct':e*100,'T_op_F':sis.condiciones.T_agua_caliente_F,
            'trace':_trace('Vt=E·Vs/(Pa−Pf)',{'E':e,'Vs_gal':volume,'Pa':a,'Pf':f},result,'gal','[P3-pág.34] · '+t.fuente)}


def paso_8_soportes(sis, diag, dim):
    """[P3-pág.8] Max spacing. End supports counted; shared supports not merged."""
    cat=_pipe_catalog(sis);rows=[]
    for s in dim['secciones']:
        spacing=cat[s.nps]['spacing_ft'];intervals=math.ceil(s.L_recta_ft/spacing)
        rows.append({'id':s.id,'nps':s.nps,'L_ft':s.L_recta_ft,'spacing_ft':spacing,
                     'n_intervalos':intervals,'n_soportes':intervals+1,'fuente':cat[s.nps]['fuente']})
    diag.nota('Soportes por tramo con dos extremos; encuentros compartidos requieren revisión del trazado.')
    return {'soportes':rows,'total_soportes':sum(r['n_soportes'] for r in rows),
            'trace':_trace('N=ceil(L/separación)+1',{},rows,'unidades','[P3-pág.8]')}


def paso_9_validaciones_finales(sis, diag, resultados):
    checks=[]
    for key in PIPELINE_KEYS[:-1]:
        state='ok' if resultados.get(key) and not resultados[key].get('error') else 'error'
        checks.append({'nombre':key,'estado':state,'valor':'Calculado' if state=='ok' else 'No válido'})
    rows=resultados.get('diversidad',{}).get('exposiciones',[])
    if rows and rows[-1]['F_div']!=1:diag.error('Última exposición reducida [P3-pág.27].')
    if not 8<=sis.condiciones.delta_T_agua_F<=16:diag.warn('ΔT frío fuera del intervalo indicado en el código suministrado [8,16] °F.')
    if not 45<=sis.condiciones.T_agua_frio_F<=50:diag.warn('Agua fría fuera del intervalo indicado [45,50] °F.')
    return {'checks':checks,'apto':diag.ok,'errores':len(diag.errores),
            'trace':_trace('Todos los pasos y dependencias válidos',{},checks,'estado','Contrato THERMABOT v1')}


PIPELINE_KEYS=('cargas_del_sistema','caudales_por_zona','seleccion_fcu','diversidad',
               'dimensionamiento','bomba','tanque_de_expansion','soportes','validaciones')
PIPELINE_NAMES=('Cargas','Caudales','Fan-coils','Diversidad','Tuberías','Bomba','Tanque','Soportes','Validaciones')


def ejecutar_pipeline(sis: SistemaAgua, verbose_callback=None) -> dict:
    """Always report nine steps; failures block dependent steps, never fake success.

    The caller's object is never mutated. API and original result keys preserved.
    """
    sis=copy.deepcopy(sis);diag=Diagnostico();r={};stages=[]
    try:validar_entrada(sis)
    except (ValueError,TypeError,KeyError,AttributeError) as ex:diag.error('Entrada: '+str(ex))
    funcs=(lambda:paso_1_cargas(sis,diag),
           lambda:paso_2_caudales(sis,diag,r['cargas_del_sistema']),
           lambda:paso_3_seleccion_fcu(sis,diag,r['caudales_por_zona']),
           lambda:paso_4_diversidad(sis,diag,r['caudales_por_zona'],r['seleccion_fcu']),
           lambda:paso_5_dimensionamiento(sis,diag,r['diversidad']),
           lambda:paso_6_bomba(sis,diag,r['dimensionamiento'],r['diversidad'],r['seleccion_fcu']),
           lambda:paso_7_tanque(sis,diag,r['dimensionamiento']),
           lambda:paso_8_soportes(sis,diag,r['dimensionamiento']),
           lambda:paso_9_validaciones_finales(sis,diag,r))
    deps=((),(0,),(1,),(1,2),(3,),(2,3,4),(4,),(4,),())
    input_valid=diag.ok
    for idx,(key,fn) in enumerate(zip(PIPELINE_KEYS,funcs)):
        before=len(diag.errores)
        blocked=(not input_valid or any(stages[d]['estado']!='ok' for d in deps[idx])) and idx!=8
        if blocked:
            value={'error':'Dependencia o entrada inválida.'};status='bloqueado'
        else:
            try:
                value=fn();status='ok' if len(diag.errores)==before else 'error'
            except (ValueError,TypeError,KeyError,AttributeError,ZeroDivisionError,OverflowError) as ex:
                diag.error(PIPELINE_NAMES[idx]+': '+str(ex));value={'error':str(ex)};status='error'
        r[key]=value
        if idx==8 and not diag.ok:status='error'
        stages.append({'paso':idx+1,'nombre':PIPELINE_NAMES[idx],'clave':key,'estado':status})
        if verbose_callback:verbose_callback(idx+1,PIPELINE_NAMES[idx],value)
    return {'resultado':r,'diagnostico':diag,'sistema':sis,'pasos':stages,
            'schema':SCHEMA,'version':VERSION,'apto':diag.ok and all(s['estado']=='ok' for s in stages)}


def _json_pairs(pairs):
    result={}
    for key,value in pairs:
        if key in result:raise ValueError('Clave JSON duplicada: '+key)
        result[key]=value
    return result


def leer_json(path):
    p=Path(path)
    if p.stat().st_size>20_000_000:raise ValueError('JSON excede 20 MB.')
    return json.loads(p.read_text(encoding='utf-8-sig'),object_pairs_hook=_json_pairs,
                      parse_constant=lambda value:(_ for _ in ()).throw(ValueError('JSON no finito: '+value)))


def adaptar_balance(balance: dict, config: dict) -> dict:
    """Consume existing thermal RESULTS only; no thermal formulas or recomputation.

    Loads include a unit and source, plus summer profiles and winter totals.
    The declared base ('local' or 'equipo') prevents counting outdoor air twice.
    Exposure/order/catalog/layout are engineering inputs, not inferred from walls.
    """
    if not isinstance(balance,dict) or not isinstance(config,dict):raise ValueError('Balance/configuración deben ser objetos JSON.')
    if balance.get('schema')!='thermabot.water-loads.v1':raise ValueError('Contrato de cargas de balance incompatible.')
    if balance.get('base_carga') not in ('local','equipo'):raise ValueError('Declarar base_carga local/equipo.')
    result=copy.deepcopy(config)
    result.setdefault('layout',{}).setdefault('diversidad','sin_diversidad')
    if 'espacios' in result:raise ValueError('No duplicar espacios/cargas en configuración hidráulica.')
    exposure=result.pop('exposiciones',{})
    project=balance['proyecto'];result['proyecto']={'id':project['id'],'nombre':project['nombre'],
                                                 'fecha':balance.get('fecha','')}
    result['espacios']=[]
    ids=set()
    for room in balance['espacios']:
        rid=texto(room['id'],'balance.id')
        if rid in ids:raise ValueError('Espacio duplicado en exportación de balance.')
        ids.add(rid)
        cooling=room['verano'];heating=room['invierno']
        unit=cooling['unidad'];profiles=[]
        for h in cooling.get('perfil',[]):
            profiles.append({'hour':h['hora'],'total_btuh':convertir_potencia(h['total'],unit),
                             'sensible_btuh':convertir_potencia(h['sensible'],unit)})
        source=room['procedencia'];texto(source.get('motor'),'balance.motor')
        if not source.get('trace_ids'):raise ValueError('Falta vínculo a trazas del balance.')
        result['espacios'].append({'id':rid,'nombre':room['nombre'],
            'exposicion':exposure.get(rid,'SIN_ASIGNAR'),
            'Q_total_btuh':convertir_potencia(cooling['total'],unit),
            'Q_sensible_btuh':convertir_potencia(cooling['sensible'],unit),
            'Q_calef_btuh':convertir_potencia(heating['total'],heating['unidad']),
            'perfil_frio':profiles,'procedencia':source})
    if set(exposure)-ids:raise ValueError('Exposición asignada a un espacio inexistente.')
    if result.get('layout',{}).get('diversidad','sin_diversidad')=='chart6' and set(exposure)!=ids:
        raise ValueError('Chart 6 necesita exposición explícita de cada espacio.')
    result['procedencia']={'balance_schema':balance['schema'],'base_carga':balance['base_carga'],
                          'proyecto_id':project['id'],'motor':balance.get('motor'),
                          'fecha':balance.get('fecha'),'revision':balance.get('revision',{}),
                          'firma_entradas':balance.get('firma_entradas')}
    if balance['base_carga']=='local':result['procedencia']['nota_aire_exterior']='Dimensionar central/aire exterior por separado; no incluido en estas cargas de local.'
    return result


def sistema_desde_dict(data):
    if not isinstance(data,dict):raise ValueError('Raíz JSON debe ser objeto.')
    if 'balance_termico' in data:
        if data.get('schema')!=SCHEMA:raise ValueError('Contrato de integración no compatible.')
        data=adaptar_balance(data['balance_termico'],data['configuracion_agua'])
    allowed={'proyecto','condiciones_diseno','espacios','layout','catalogo_fcu','tabla_leq',
             'material','tanque','tuberias','procedencia'}
    if set(data)-allowed:raise ValueError('Campos de entrada desconocidos: '+', '.join(sorted(set(data)-allowed)))
    layout=data.get('layout',{})
    if set(layout)-{'tipo','orden_exposiciones','secciones','circuitos','diversidad'}:raise ValueError('Campos de layout desconocidos.')
    return SistemaAgua(proyecto=Proyecto(**data.get('proyecto',{})),
         condiciones=CondicionesDiseno(**data.get('condiciones_diseno',{})),
         espacios=[Espacio(**e) for e in data.get('espacios',[])],
         layout=Layout(**{**layout,'secciones':[Seccion(**s) for s in layout.get('secciones',[])]}),
         catalogo_fcu=[ModeloFCU(**m) for m in data.get('catalogo_fcu',[])],
         tabla_leq=data.get('tabla_leq','table11'),material=data.get('material','steel'),
         tanque=ConfiguracionTanque(**data.get('tanque',{})),tuberias=data.get('tuberias',{}),
         procedencia=data.get('procedencia',{}))


def cargar_json(path):return sistema_desde_dict(leer_json(path))


def sistema_a_dict(sis):
    result=asdict(sis);result['condiciones_diseno']=result.pop('condiciones')
    return result


def serializable(value):
    if is_dataclass(value):return serializable(asdict(value))
    if isinstance(value,dict):return {str(k):serializable(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [serializable(v) for v in value]
    return value


def resultado_a_dict(out):
    return {'schema':SCHEMA,'version':VERSION,'proyecto':asdict(out['sistema'].proyecto),
            'input':sistema_a_dict(out['sistema']),'resultado':serializable(out['resultado']),
            'diagnostico':asdict(out['diagnostico']),'pasos':out['pasos'],'apto':out['apto'],
            'validacion_documental':'pendiente: tablas suministradas, no contrastadas independientemente con el manual'}


def guardar_json(path, payload):
    """Atomic output. Never overwrite valid prior results with a partial write."""
    path=Path(path).resolve();temporary=None
    try:
        with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=path.parent,delete=False) as stream:
            temporary=Path(stream.name)
            json.dump(payload,stream,ensure_ascii=False,allow_nan=False,indent=2)
            stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path)
    finally:
        if temporary and temporary.exists():temporary.unlink()


def tabla(headers, rows, aligns=None, colores=None):
    """Unicode terminal widths with ANSI escapes ignored, no third-party wcwidth."""
    def width(s):return sum(0 if unicodedata.combining(c) else 2 if unicodedata.east_asian_width(c) in 'WF' else 1
                            for c in re.sub(r'\x1b\[[0-9;]*m','',str(s)))
    rows=[list(map(str,row)) for row in rows];headers=list(map(str,headers));n=len(headers)
    if any(len(row)!=n for row in rows):raise ValueError('Número de columnas incompatible.')
    widths=[max([width(headers[i])]+[width(row[i]) for row in rows]) for i in range(n)]
    align=aligns or ['l']*n
    def line(c):return '  '+c[0]+c[1].join('─'*(w+2) for w in widths)+c[2]
    def row(values):
        padded=[]
        for i,v in enumerate(values):
            pad=widths[i]-width(v)
            v=(' '*pad+v) if align[i]=='r' else (v+' '*pad) if align[i]=='l' else ' '*(pad//2)+v+' '*(pad-pad//2)
            padded.append(' '+v+' ')
        return '  │'+'│'.join(padded)+'│'
    return '\n'.join([line('┌┬┐'),row(headers),line('├┼┤')]+[row(r) for r in rows]+[line('└┴┘')])


def imprimir_resultado(sis, resultado, diag, pasos=None):
    print(f'{C.CYAN}╔'+('═'*76)+'╗'+C.RESET)
    print(f'{C.BOLD}  THERMABOT · CARRIER WATER {VERSION} · DOS CAÑOS{C.RESET}')
    print(f'  {sis.proyecto.nombre} · agua fría/caliente')
    print(f'{C.CYAN}╚'+('═'*76)+'╝'+C.RESET)
    for index,key in enumerate(PIPELINE_KEYS):
        print(seccion(index+1,9,PIPELINE_NAMES[index].upper()))
        r=resultado.get(key,{})
        if r.get('error'):print(err(r['error']));continue
        if key=='cargas_del_sistema':
            print(kv('Carga de bloque',f"{r['Q_bloque_btuh']:,.0f} BTU/h · hora {r['hora_bloque']}"))
            print(kv('Planta (+5%, una vez)',f"{r['Q_refrig_btuh']:,.0f} BTU/h · {r['Q_refrig_ton']:.2f} TR"))
            print(kv('Calefacción',f"{r['Q_calef_btuh']:,.0f} BTU/h"))
        elif key=='caudales_por_zona':
            print(tabla(['Espacio','Frío gpm','Caliente gpm'],[(i,f'{v:.3f}',f"{r['gpm_calef_por_zona'][i]:.3f}") for i,v in r['gpm_por_zona'].items()],['l','r','r']))
        elif key=='seleccion_fcu':
            print(tabla(['Espacio','Modelo','Total BTU/h','Sensible','gpm nominal'],[(i,m.codigo if m else 'NO VÁLIDO',f'{m.Q_tot_nom_btuh:.0f}' if m else '—',f'{m.Q_sens_nom_btuh:.0f}' if m else '—',f'{m.GPM_nom:.3f}' if m else '—') for i,m in r['selecciones'].items()]))
        elif key=='diversidad':
            print(kv('Modo',r['modo']));print(kv('Caudal frío / caliente',f"{r['gpm_bomba_frio']:.3f} / {r['gpm_bomba_calef']:.3f} gpm"))
            if r['exposiciones']:print(tabla(['Exposición','GPM','Factor','Diseño gpm'],[(v['exposicion'],f"{v['gpm_max']:.3f}",f"{v['F_div']:.3f}",f"{v['gpm_diseño']:.3f}") for v in r['exposiciones']]))
        elif key=='dimensionamiento':
            print(tabla(['Tramo','NPS','gpm','v fps','Leq ft','h frío ft','h calor ft'],[(s.id,s.nps,f'{s.gpm_diseno:.3f}',f'{s.v_fps:.3f}',f'{s.L_eq_ft:.2f}',f'{s.dh_frio_ft:.3f}',f'{s.dh_calef_ft:.3f}') for s in r['secciones']]))
        elif key=='bomba':
            for season in ('frio','calef'):print(kv(season,f"{r[season]['Q_gpm']:.3f} gpm @ {r[season]['H_ft']:.3f} ft"))
            print(info(r['nota']))
        elif key=='tanque_de_expansion':
            print(kv('Volumen total real',f"{r['V_sist_total_gal']:.3f} gal"));print(kv('Tanque requerido',f"{r['V_tanque_gal']:.3f} gal"))
        elif key=='soportes':
            print(tabla(['Tramo','NPS','Separación ft','Cantidad'],[(v['id'],v['nps'],v['spacing_ft'],v['n_soportes']) for v in r['soportes']]))
        else:
            for check in r['checks']:print((ok if check['estado']=='ok' else err)(check['nombre']+' · '+check['valor']))
    print('\n'+(ok('CÁLCULO COMPLETO') if diag.ok else err('CÁLCULO NO VÁLIDO')))
    for message in diag.errores:print(err(message))
    for message in diag.warnings:print(warn(message))
    for message in diag.info:print(info(message))


def sistema_demo():
    """Synthetic software test fixture, NOT manufacturer data or a Carrier example."""
    cond=CondicionesDiseno(delta_T_calef_F=20.,rugosidad_ft=.00015,
        viscosidad_frio_ft2_s=.000015,viscosidad_calef_ft2_s=.000005,
        fuente_fluido='DEMO SINTÉTICA: propiedades declaradas para probar software')
    model=ModeloFCU(codigo='DEMO-NO-COMERCIAL',Q_tot_nom_btuh=12000.,Q_sens_nom_btuh=10000.,
        CFM_nom=500.,GPM_nom=2.4,OD_tubo_in=.5,N_circuitos=2,dP_agua_psi=1.,
        Q_calef_nom_btuh=10000.,GPM_calef_nom=1.5,dP_calef_psi=.5,
        fuente='DEMO SINTÉTICA: no usar para selección de fabricante',condiciones_verificadas=True,
        condiciones={'T_agua_frio_F':45.,'T_interior_verano_F':75.,'T_agua_caliente_F':140.,
                     'T_interior_invierno_F':70.,'fuente_psicrometrica':'DEMO: capacidad sensible/total declarada'})
    return SistemaAgua(proyecto=Proyecto(nombre='DEMO SINTÉTICA · no es un caso Carrier',id='demo-agua'),
        condiciones=cond,espacios=[Espacio('A','N',10000.,7000.,8000.,'Ambiente de prueba')],
        catalogo_fcu=[model],layout=Layout(diversidad='sin_diversidad',
            secciones=[Seccion('ida','auto',40.,espacios_servidos=['A'],direccion='ida'),Seccion('retorno','auto',40.,espacios_servidos=['A'],direccion='retorno')],
            circuitos=[{'id':'circuito-A','espacio_id':'A','secciones':['ida','retorno'],
                        'perdidas_equipo_ft':4.,'perdidas_equipo_calef_ft':2.,'fuente_perdidas':'DEMO: pérdidas declaradas, no ficha comercial'}]),
        tanque=ConfiguracionTanque(volumen_equipos_gal=20.,E=.02,P_a=1.,P_f=.6,
                                  fuente='DEMO: coeficientes adimensionales ilustrativos, no tabla Carrier'))


def main(argv=None):
    parser=argparse.ArgumentParser(description='THERMABOT · Agua dos caños · nueve pasos · stdlib')
    source=parser.add_mutually_exclusive_group()
    source.add_argument('--input','-i');source.add_argument('--demo',action='store_true')
    parser.add_argument('--balance-input',help='Exportación de cargas THERMABOT existente; requiere --config-agua.')
    parser.add_argument('--config-agua',help='Configuración hidráulica sin duplicar cargas.')
    parser.add_argument('--json-output');parser.add_argument('--export-input')
    parser.add_argument('--no-color',action='store_true');parser.add_argument('--color',action='store_true')
    args=parser.parse_args(argv)
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    for k,v in ANSI_PALETTE.items():setattr(C,k,v)
    if args.no_color or 'NO_COLOR' in os.environ or (not args.color and not sys.stdout.isatty()):C.disable()
    try:
        if args.config_agua and not args.balance_input:raise ValueError('--config-agua requiere --balance-input.')
        sources=[Path(p).resolve() for p in (args.input,args.balance_input,args.config_agua) if p]
        targets=[Path(p).resolve() for p in (args.json_output,args.export_input) if p]
        if any(p in sources for p in targets) or len(targets)!=len(set(targets)):
            raise ValueError('Salida debe usar un archivo distinto a las entradas y a las otras salidas.')
        if args.balance_input:
            if args.input or args.demo or not args.config_agua:raise ValueError('--balance-input requiere --config-agua sin --input/--demo.')
            sis=sistema_desde_dict(adaptar_balance(leer_json(args.balance_input),leer_json(args.config_agua)))
        elif args.input:sis=cargar_json(args.input)
        elif args.demo:sis=sistema_demo()
        else:parser.print_help();return 1
        if args.export_input:guardar_json(args.export_input,sistema_a_dict(sis));return 0
        out=ejecutar_pipeline(sis);imprimir_resultado(out['sistema'],out['resultado'],out['diagnostico'],out['pasos'])
        if args.json_output:guardar_json(args.json_output,resultado_a_dict(out))
        return 0 if out['apto'] else 2
    except (OSError,ValueError,TypeError,KeyError,AttributeError,RecursionError) as ex:
        print(err(str(ex)),file=sys.stderr);return 1


if __name__=='__main__':
    sys.exit(main())
