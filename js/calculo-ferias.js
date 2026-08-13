/*
 * Motor de cálculo de férias — porta de calculo_ferias.py.
 *
 * Regras (simplificadas a partir da CLT), mesmas do módulo Python:
 * - Período aquisitivo: 12 meses corridos a partir da admissão (e depois a
 *   partir do fim do período aquisitivo anterior). Ao completar, adquire
 *   direito a 30 dias de férias (art. 130, CLT).
 * - Período concessivo: os 12 meses seguintes ao término do período
 *   aquisitivo, prazo para a empresa conceder as férias (art. 134, CLT).
 * - Simplificação: sem redução de dias por faltas injustificadas.
 *
 * Datas são strings "YYYY-MM-DD". Sem depender de nenhuma biblioteca externa
 * de datas (equivalente ao dateutil.relativedelta usado na versão Python).
 */

var DIAS_DIREITO_PADRAO = 30;
var LIMITE_DIAS_ALERTA_VENCENDO = 60;

function parseISO(iso) {
  var p = iso.split("-");
  return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
}
function formatISO(y, m, d) {
  return String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
function daysInMonth(y, m1based) {
  return new Date(Date.UTC(y, m1based, 0)).getUTCDate();
}
function addYears(iso, years) {
  var p = parseISO(iso);
  var newY = p.y + years;
  var maxDay = daysInMonth(newY, p.m);
  return formatISO(newY, p.m, Math.min(p.d, maxDay));
}
function addDays(iso, days) {
  var p = parseISO(iso);
  var d = new Date(Date.UTC(p.y, p.m - 1, p.d));
  d.setUTCDate(d.getUTCDate() + days);
  return formatISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function diffDias(isoInicio, isoFim) {
  var a = new Date(parseISO(isoInicio).y, 0, 1); // só para diffs, usamos epoch UTC abaixo
  var d1 = Date.UTC(parseISO(isoInicio).y, parseISO(isoInicio).m - 1, parseISO(isoInicio).d);
  var d2 = Date.UTC(parseISO(isoFim).y, parseISO(isoFim).m - 1, parseISO(isoFim).d);
  return Math.round((d2 - d1) / 86400000);
}

/** Equivalente simplificado do dateutil.relativedelta(fim, inicio). */
function relativeDelta(inicioIso, fimIso) {
  var i = parseISO(inicioIso), f = parseISO(fimIso);
  var years = f.y - i.y;
  var months = f.m - i.m;
  var days = f.d - i.d;
  if (days < 0) {
    months -= 1;
    var pm = f.m - 1, py = f.y;
    if (pm === 0) { pm = 12; py -= 1; }
    days += daysInMonth(py, pm);
  }
  if (months < 0) { years -= 1; months += 12; }
  return { years: years, months: months, days: days };
}

/** Meses completos entre duas datas, fração >= 15 dias conta como mês inteiro. Máx. 12. */
function mesesCompletosFracao(inicio, fim) {
  if (!inicio || !fim || fim < inicio) return 0;
  var d = relativeDelta(inicio, fim);
  var meses = d.years * 12 + d.months;
  if (d.days >= 15) meses += 1;
  return Math.max(0, Math.min(meses, 12));
}

function montaPeriodo(colaborador, inicio, fim, hoje, completo, gozos) {
  var diasGozados = gozos
    .filter(function (g) { return g.periodoAquisitivoInicio === inicio; })
    .reduce(function (soma, g) { return soma + g.dias; }, 0);

  if (!completo) {
    return {
      inicio: inicio, fim: fim, concessivoFim: null, completo: false,
      diasDireito: DIAS_DIREITO_PADRAO, diasGozados: diasGozados,
      saldo: DIAS_DIREITO_PADRAO - diasGozados, status: "EM_ANDAMENTO",
      diasParaVencer: null, mesesDecorridos: mesesCompletosFracao(inicio, hoje),
    };
  }

  var concessivoFim = addYears(fim, 1);
  var saldo = DIAS_DIREITO_PADRAO - diasGozados;
  var diasParaVencer = diffDias(hoje, concessivoFim);

  var status;
  if (saldo <= 0) status = "GOZADO";
  else if (hoje > concessivoFim) status = "VENCIDO";
  else if (diasParaVencer <= LIMITE_DIAS_ALERTA_VENCENDO) status = "VENCENDO";
  else status = "DISPONIVEL";

  return {
    inicio: inicio, fim: fim, concessivoFim: concessivoFim, completo: true,
    diasDireito: DIAS_DIREITO_PADRAO, diasGozados: diasGozados, saldo: saldo,
    status: status, diasParaVencer: diasParaVencer, mesesDecorridos: 12,
  };
}

/**
 * colaborador: {dataAdmissao, dataDemissao}
 * gozos: array de {periodoAquisitivoInicio, dias, ...}
 * Retorna array de períodos, do mais antigo ao mais recente.
 */
function periodosAquisitivos(colaborador, hoje, gozos) {
  gozos = gozos || [];
  var admissao = colaborador.dataAdmissao;
  var fimCalculo = colaborador.dataDemissao || hoje;

  var periodos = [];
  var inicio = admissao;
  var seguranca = 0;
  while (seguranca < 60) {
    seguranca++;
    var fim = addYears(inicio, 1);
    var completo = fim <= fimCalculo;
    periodos.push(montaPeriodo(colaborador, inicio, fim, fimCalculo, completo, gozos));
    if (!completo) break;
    inicio = fim;
  }
  return periodos;
}

function periodosComAlerta(colaborador, hoje, gozos) {
  return periodosAquisitivos(colaborador, hoje, gozos).filter(function (p) {
    return p.status === "VENCENDO" || p.status === "VENCIDO";
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DIAS_DIREITO_PADRAO, LIMITE_DIAS_ALERTA_VENCENDO,
    parseISO, formatISO, daysInMonth, addYears, addDays, diffDias, relativeDelta,
    mesesCompletosFracao, periodosAquisitivos, periodosComAlerta,
  };
}
