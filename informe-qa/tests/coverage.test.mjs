import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageSummary,coverageStatus,filterCoverage} from '../src/coverage.js';

const cases=[
  {uid:'a',id:'CP-001',name:'Consulta válida',module:'Cheques',type:'Positivo',result:'OK',reviewed:false,evidence:[]},
  {uid:'b',id:'CP-002',name:'Rechazar vacío',module:'Cheques',type:'Negativo',result:'KO',reviewed:true,evidence:[{dataUrl:'preserve'}]},
  {uid:'c',id:'CP-003',name:'Otra consulta',module:'Empresas',type:'Alternativo',result:'OK',bug:{enabled:true},reviewed:true,evidence:[{},{}]},
  {uid:'d',id:'CP-004',name:'Pendiente',module:'Pagos',result:'Pendiente',reviewed:false},
  {uid:'e',id:'CP-005',result:'Bloqueado',reviewed:true,evidence:[]}
];

test('Cobertura separa resultados, revisión y evidencias sin contar dos veces un bug',()=>{
  assert.deepEqual(coverageSummary(cases),{total:5,passed:1,failed:2,pending:2,reviewed:3,withEvidence:2,evidence:3,reviewPercent:60});
  assert.equal(coverageStatus(cases[0]),'passed');
  assert.equal(coverageStatus(cases[2]),'failed');
  assert.deepEqual(coverageSummary([]),{total:0,passed:0,failed:0,pending:0,reviewed:0,withEvidence:0,evidence:0,reviewPercent:0});
});

test('Filtros combinados mantienen el orden original e incluyen casos no seleccionados para exportar',()=>{
  assert.deepEqual(filterCoverage(cases,{query:' CHEQUES ',status:'failed',review:'reviewed'}).map(c=>c.uid),['b']);
  assert.deepEqual(filterCoverage(cases,{query:'cp-003'}).map(c=>c.uid),['c']);
  assert.deepEqual(filterCoverage(cases,{query:'positivo',review:'draft'}).map(c=>c.uid),['a']);
  assert.deepEqual(filterCoverage(cases,{status:'pending'}).map(c=>c.uid),['d','e']);
  assert.equal(filterCoverage(cases,{query:'inexistente'}).length,0);
});

test('Consultar cobertura no modifica casos, evidencias, IDs ni la selección de exportación',()=>{
  const data=structuredClone(cases);data[0].selected=false;
  const before=structuredClone(data);
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}};
  freeze(data);
  coverageSummary(data);filterCoverage(data,{status:'failed'});filterCoverage(data);
  assert.deepEqual(data,before);
  assert.equal(filterCoverage(data).length,5);
});
