"""Validation of software and supplied equations; NOT Carrier example certification.

Run: python -m unittest discover -s water -p test_suite.py -v
Only Python standard library; all FCU test data are explicitly synthetic.
"""
import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import carrier_water as cw

HERE=Path(__file__).resolve().parent


class WaterTests(unittest.TestCase):
    def setUp(self):
        self.sis=cw.sistema_demo()

    def pipeline(self):
        return cw.ejecutar_pipeline(self.sis)

    def test_all_nine_steps_and_no_mutation(self):
        before=cw.sistema_a_dict(self.sis)
        callbacks=[]
        out=cw.ejecutar_pipeline(self.sis,lambda i,n,r:callbacks.append(i))
        self.assertTrue(out['apto'],out['diagnostico'].errores)
        self.assertEqual(callbacks,list(range(1,10)))
        self.assertEqual(list(out['resultado']),list(cw.PIPELINE_KEYS))
        self.assertEqual(cw.sistema_a_dict(self.sis),before)
        self.assertEqual(cw.resultado_a_dict(out),cw.resultado_a_dict(self.pipeline()))

    def test_integration_contract_uses_thermal_results_only(self):
        data=cw.leer_json(HERE/'ejemplo_entrada.json')
        original=copy.deepcopy(data)
        out=cw.ejecutar_pipeline(cw.sistema_desde_dict(data))
        self.assertTrue(out['apto'],out['diagnostico'].errores)
        self.assertEqual(out['resultado']['cargas_del_sistema']['Q_bloque_btuh'],10000)
        self.assertEqual(out['resultado']['cargas_del_sistema']['hora_bloque'],15)
        self.assertEqual(out['sistema'].espacios[0].procedencia['trace_ids'],data['balance_termico']['espacios'][0]['procedencia']['trace_ids'])
        self.assertEqual(data,original)
        self.assertTrue(any('preliminar' in w for w in out['diagnostico'].warnings))

    def test_factor500_and_separate_seasons(self):
        r=self.pipeline()['resultado']
        self.assertEqual(r['caudales_por_zona']['gpm_por_zona']['A'],2.)
        self.assertEqual(r['caudales_por_zona']['gpm_calef_por_zona']['A'],.8)
        self.assertEqual(r['cargas_del_sistema']['Q_refrig_btuh'],10500)
        self.assertEqual(r['seleccion_fcu']['gpm_operacion']['A'],2.4)
        self.assertEqual(r['diversidad']['gpm_bomba'],2.4)

    def test_winter_can_govern_diameter_without_summing_seasons(self):
        self.sis.catalogo_fcu[0].GPM_calef_nom=5.
        out=self.pipeline();self.assertTrue(out['apto'],out['diagnostico'].errores)
        sec=out['resultado']['dimensionamiento']['secciones'][0]
        self.assertEqual(sec.gpm_diseno,5.)
        self.assertEqual(out['resultado']['bomba']['calef']['Q_gpm'],5.)

    def test_cooling_only_has_no_heating_pump_head(self):
        self.sis.espacios[0].Q_calef_btuh=0.
        out=self.pipeline();self.assertTrue(out['apto'])
        self.assertEqual(out['resultado']['bomba']['calef'],{'Q_gpm':0.,'H_ft':0.})

    def test_units_and_reject_unknown(self):
        self.assertAlmostEqual(cw.convertir_potencia(1000,'W'),cw.convertir_potencia(1,'kW'))
        self.assertAlmostEqual(cw.convertir_potencia(1,'BTU/h'),1.)
        self.assertAlmostEqual(cw.velocidad_fps(1,1),231/(60*math.pi/4)/12)
        with self.assertRaises(ValueError):cw.convertir_potencia(100,'ton')

    def test_coincident_block_is_not_sum_of_maxima(self):
        a=self.sis.espacios[0]
        a.perfil_frio=[{'hour':9,'total_btuh':10000.,'sensible_btuh':7000.},{'hour':15,'total_btuh':5000.,'sensible_btuh':3000.}]
        b=copy.deepcopy(a);b.id='B';b.exposicion='E'
        b.perfil_frio=list(reversed([{'hour':9,'total_btuh':5000.,'sensible_btuh':3000.},{'hour':15,'total_btuh':10000.,'sensible_btuh':7000.}]))
        self.sis.espacios.append(b)
        r=cw.paso_1_cargas(self.sis,cw.Diagnostico())
        self.assertEqual(r['suma_maximos_btuh'],20000)
        self.assertEqual(r['Q_bloque_btuh'],15000)
        self.assertEqual(r['Q_refrig_btuh'],15750)

    def test_chart6_last_exposure_unreduced_and_weighted_once(self):
        b=copy.deepcopy(self.sis.espacios[0]);b.id='B';b.exposicion='E';self.sis.espacios.append(b)
        self.sis.layout.diversidad='chart6';self.sis.layout.orden_exposiciones=['N','E']
        ca={'gpm_por_zona':{'A':2.,'B':2.},'gpm_calef_por_zona':{'A':.8,'B':.8}}
        r=cw.paso_4_diversidad(self.sis,cw.Diagnostico(),ca)
        self.assertEqual(r['exposiciones'][-1]['F_div'],1.)
        self.assertAlmostEqual(r['gpm_bomba_frio'],2*cw.chart_6_interp(.5)+2)
        self.sis.layout.secciones[0].espacios_servidos=['A','B']
        self.sis.layout.secciones[1].espacios_servidos=['B']
        sizes=cw.paso_5_dimensionamiento(self.sis,cw.Diagnostico(),r)
        self.assertAlmostEqual(sizes['secciones'][0].gpm_frio,r['gpm_bomba_frio'])
        self.assertEqual(sizes['secciones'][1].gpm_frio,2.)

    def test_missing_chart_order_errors_without_fake_diversity(self):
        self.sis.layout.diversidad='chart6'
        self.assertFalse(self.pipeline()['apto'])

    def test_coincident_diversity_requires_actual_profiles_and_flow_curves(self):
        self.sis.layout.diversidad='coincidente'
        out=self.pipeline();self.assertFalse(out['apto'])
        self.assertEqual(out['pasos'][3]['estado'],'error')
        self.assertEqual(out['pasos'][4]['estado'],'bloqueado')

    def test_pump_uses_critical_parallel_path_and_real_components(self):
        b=copy.deepcopy(self.sis.espacios[0]);b.id='B';self.sis.espacios.append(b)
        sections=[cw.Seccion('A-ida','auto',40.,espacios_servidos=['A']),cw.Seccion('A-ret','auto',40.,espacios_servidos=['A']),cw.Seccion('B-ida','auto',10.,espacios_servidos=['B']),cw.Seccion('B-ret','auto',10.,espacios_servidos=['B'])]
        self.sis.layout.secciones=sections
        for s in sections:s.direccion='ida' if s.id.endswith('ida') else 'retorno'
        self.sis.layout.circuitos=[{'id':id,'espacio_id':id,'secciones':[id+'-ida',id+'-ret'],'perdidas_equipo_ft':4.,'perdidas_equipo_calef_ft':2.,'fuente_perdidas':'fixture'} for id in ['A','B']]
        out=self.pipeline();self.assertTrue(out['apto'],out['diagnostico'].errores)
        pump=out['resultado']['bomba'];dim=out['resultado']['dimensionamiento']['secciones']
        expected=sum(s.dh_frio_ft for s in dim if s.id.startswith('A'))+4+cw.PSI_TO_FT_H2O
        self.assertAlmostEqual(pump['frio']['H_ft'],expected)
        self.assertNotAlmostEqual(pump['frio']['H_ft'],sum(s.dh_frio_ft for s in dim)+4+cw.PSI_TO_FT_H2O)

    def test_pump_requires_terminal_return_route_and_source(self):
        self.sis.layout.circuitos=[]
        out=self.pipeline();self.assertFalse(out['apto'])
        self.assertEqual(out['pasos'][5]['estado'],'error')
        self.assertEqual(out['pasos'][6]['estado'],'ok')

    def test_pump_rejects_route_without_explicit_return(self):
        self.sis.layout.secciones[1].direccion='ida'
        out=self.pipeline();self.assertFalse(out['apto'])
        self.assertEqual(out['pasos'][5]['estado'],'error')

    def test_fcu_nominal_flow_is_checked_for_turbulence(self):
        self.sis.catalogo_fcu[0].N_circuitos=10
        out=self.pipeline();self.assertFalse(out['apto'])
        self.assertEqual(out['pasos'][2]['estado'],'error')
        self.assertEqual(out['pasos'][3]['estado'],'bloqueado')

    def test_fcu_missing_heating_capacity_and_conditions(self):
        self.sis.catalogo_fcu[0].Q_calef_nom_btuh=None
        self.assertFalse(self.pipeline()['apto'])

    def test_fcu_matches_actual_balance_air_conditions_including_wet_bulb(self):
        self.sis.espacios[0].procedencia={'condiciones_aire':{'verano':{'temperatura_C':25.,'bulbo_humedo_C':18.},'invierno':{'temperatura_C':21.}}}
        self.assertFalse(self.pipeline()['apto'])  # Catalog is 75°F; actual balance is 77°F.
        m=self.sis.catalogo_fcu[0]
        m.condiciones.update(T_interior_verano_F=77.,T_bh_interior_verano_F=64.4,T_interior_invierno_F=69.8)
        out=self.pipeline();self.assertTrue(out['apto'],out['diagnostico'].errores)
        m.condiciones['T_bh_interior_verano_F']=67.
        self.assertFalse(self.pipeline()['apto'])

    def test_verified_copper_requires_its_own_fittings(self):
        self.sis.material='copper';self.sis.tuberias={'L-test':{'id_in':.6,'od_in':.75,'wt_agua_lb_ft':.13,'spacing_ft':6.,'fuente':'fixture de ensayo'}}
        self.sis.layout.secciones[0].fittings={'ell90_RD1.1':1}
        self.assertFalse(self.pipeline()['apto'])
        self.sis.tuberias['L-test']['leq_fittings_ft']={'ell90_RD1.1':1.2}
        out=self.pipeline();self.assertTrue(out['apto'],out['diagnostico'].errores)
        self.assertAlmostEqual(out['resultado']['dimensionamiento']['secciones'][0].L_eq_ft,41.2)
        self.sis=cw.sistema_demo();self.sis.catalogo_fcu[0].condiciones_verificadas=False
        self.assertFalse(self.pipeline()['apto'])

    def test_tank_dimensional_coefficients_and_volume(self):
        out=self.pipeline();t=out['resultado']['tanque_de_expansion']
        pipe=sum(s.L_recta_ft*cw.STEEL_SCH40[s.nps][1]/8.34 for s in out['resultado']['dimensionamiento']['secciones'])
        self.assertAlmostEqual(t['V_tanque_gal'],.02*(20+pipe)/(.4))
        self.sis.tanque.P_f=1.1
        out=self.pipeline();self.assertFalse(out['apto'])
        self.assertEqual(out['pasos'][6]['estado'],'error')
        self.assertEqual(out['pasos'][7]['estado'],'ok')

    def test_tank_missing_volume_never_invents_equipment(self):
        self.sis.tanque.volumen_equipos_gal=None
        self.assertFalse(self.pipeline()['apto'])

    def test_supports_count_endpoints(self):
        out=self.pipeline()
        for s in out['resultado']['soportes']['soportes']:
            self.assertEqual(s['n_soportes'],math.ceil(s['L_ft']/s['spacing_ft'])+1)

    def test_incomplete_copper_does_not_silently_use_steel(self):
        self.sis.material='copper'
        self.assertFalse(self.pipeline()['apto'])
        with self.assertRaises(ValueError):cw.spacing_soporte('1/2','copper')
        with self.assertRaises(ValueError):cw.volumen_agua_tuberia('1/2',20,'copper')

    def test_invalid_fitting_not_ignored(self):
        self.sis.layout.secciones[0].fittings={'invented_elbow':1}
        out=self.pipeline();self.assertFalse(out['apto'])
        self.assertEqual(out['pasos'][4]['estado'],'error')

    def test_friction_requires_properties_or_exact_verified_point(self):
        self.sis.condiciones.viscosidad_frio_ft2_s=None
        self.assertFalse(self.pipeline()['apto'])
        for s in self.sis.layout.secciones:
            s.nps='1/2';s.friction_rate_verificado=5.;s.referencia_gpm=2.4;s.referencia_nps='1/2';s.fuente_friccion='Fixture: punto verificado'
        self.assertTrue(self.pipeline()['apto'])
        self.sis.layout.secciones[0].referencia_gpm=2.
        self.assertFalse(self.pipeline()['apto'])

    def test_bad_numbers_and_ids_are_rejected(self):
        for value in [math.nan,math.inf,-1,True,'100',None]:
            with self.subTest(value=value):
                self.sis=cw.sistema_demo();self.sis.espacios[0].Q_total_btuh=value
                out=self.pipeline();self.assertFalse(out['apto']);self.assertEqual(len(out['pasos']),9)
        self.sis=cw.sistema_demo();self.sis.espacios.append(copy.deepcopy(self.sis.espacios[0]))
        self.assertFalse(self.pipeline()['apto'])

    def test_no_extrapolation_or_glycol_factor500(self):
        for hours in [0,1000,9000]:
            with self.assertRaises(ValueError):cw.max_vel_erosion(hours)
        self.sis.condiciones.fluido='glycol';self.assertFalse(self.pipeline()['apto'])

    def test_serialization_objects_not_repr_strings_and_nine_traces(self):
        payload=cw.resultado_a_dict(self.pipeline())
        restored=json.loads(json.dumps(payload,allow_nan=False))
        self.assertIsInstance(restored['resultado']['seleccion_fcu']['selecciones']['A'],dict)
        self.assertIsInstance(restored['resultado']['dimensionamiento']['secciones'][0],dict)
        for key in cw.PIPELINE_KEYS:self.assertIn('trace',restored['resultado'][key])

    def test_json_duplicate_nonfinite_and_oversized_exponents(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'x.json'
            for raw in ['{"x":1,"x":2}','{"x":NaN}','{"x":Infinity}']:
                p.write_text(raw,encoding='utf-8')
                with self.assertRaises(ValueError):cw.leer_json(p)
            p.write_text('{"x":1e400}',encoding='utf-8')
            # Python parses exponent to inf; downstream strict number boundary rejects it.
            with self.assertRaises(ValueError):cw.numero(cw.leer_json(p)['x'],'x')

    def test_adapter_rejects_duplicated_loads_and_missing_provenance(self):
        d=cw.leer_json(HERE/'ejemplo_entrada.json')
        d['configuracion_agua']['espacios']=[]
        with self.assertRaises(ValueError):cw.sistema_desde_dict(d)
        d=cw.leer_json(HERE/'ejemplo_entrada.json');d['balance_termico']['espacios'][0]['procedencia']['trace_ids']=[]
        with self.assertRaises(ValueError):cw.sistema_desde_dict(d)

    def test_cli_professional_output_no_ansi_when_disabled_and_failed_exit(self):
        with tempfile.TemporaryDirectory() as d:
            result=Path(d)/'result.json'
            args=[sys.executable,str(HERE/'carrier_water.py'),'--input',str(HERE/'ejemplo_entrada.json'),'--json-output',str(result),'--no-color']
            proc=subprocess.run(args,capture_output=True,encoding='utf-8')
            self.assertEqual(proc.returncode,0,proc.stderr)
            self.assertEqual(proc.stdout.count('► PASO '),9)
            self.assertIn('┌',proc.stdout);self.assertNotIn('\033[',proc.stdout)
            self.assertTrue(cw.leer_json(result)['apto'])
            data=cw.leer_json(HERE/'ejemplo_entrada.json');data['configuracion_agua']['catalogo_fcu']=[]
            bad=Path(d)/'bad.json';cw.guardar_json(bad,data)
            proc=subprocess.run([sys.executable,str(HERE/'carrier_water.py'),'--input',str(bad),'--no-color'],capture_output=True,encoding='utf-8')
            self.assertEqual(proc.returncode,2);self.assertEqual(proc.stdout.count('► PASO '),9)

    def test_cli_no_overwrite_of_source_and_no_unhandled_malformed_data(self):
        proc=subprocess.run([sys.executable,str(HERE/'carrier_water.py'),'--input',str(HERE/'ejemplo_entrada.json'),'--json-output',str(HERE/'ejemplo_entrada.json')],capture_output=True,encoding='utf-8')
        self.assertEqual(proc.returncode,1);self.assertIn('distinto',proc.stderr)
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'x.json';p.write_text('{"layout":[]}',encoding='utf-8')
            proc=subprocess.run([sys.executable,str(HERE/'carrier_water.py'),'--input',str(p)],capture_output=True,encoding='utf-8')
            self.assertEqual(proc.returncode,1);self.assertNotIn('Traceback',proc.stderr)


if __name__=='__main__':unittest.main(verbosity=2)
