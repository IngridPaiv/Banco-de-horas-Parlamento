/*
 * Motor de cálculo do banco de horas.
 * Porta fiel de calculo.py (versão Python do mesmo sistema) — mesma lógica,
 * mesmos nomes de função (em camelCase), para manter os dois em paralelo.
 *
 * - trabalhadas = (saida - entrada) - (retornoAlmoco - saidaAlmoco)
 * - jornadaEsperada = jornada contratual do colaborador, só em dia útil p/ ele
 * - saldo = trabalhadas - jornadaEsperada
 * - saldo final do período = soma(positivo) - soma(negativo) + ajustes(credito - debito)
 *
 * Datas são sempre strings "YYYY-MM-DD" (sem hora), para evitar problemas de
 * fuso horário. colaborador.dias é um array de inteiros 0=domingo..6=sábado
 * (mesma convenção do JS Date.getDay()).
 */

var DIAS_NOME = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function toMinutes(hhmm) {
  if (!hhmm) return null;
  var partes = hhmm.split(":");
  var h = Number(partes[0]), m = Number(partes[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHHMM(total) {
  total = Math.abs(total || 0);
  var h = Math.floor(total / 60), m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function minutesToSignedHHMM(total) {
  var sign = total < 0 ? "-" : total > 0 ? "+" : "";
  var abs = Math.abs(total);
  var h = Math.floor(abs / 60), m = abs % 60;
  return sign + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function validarHorarios(entrada, saidaAlmoco, retornoAlmoco, saida) {
  var e = toMinutes(entrada), sa = toMinutes(saidaAlmoco);
  var ra = toMinutes(retornoAlmoco), s = toMinutes(saida);
  if ([e, sa, ra, s].some(function (v) { return v === null; })) return "Preencha todos os horários corretamente.";
  if (sa <= e) return "A saída para o almoço deve ser depois da entrada.";
  if (ra <= sa) return "O retorno do almoço deve ser depois da saída para o almoço.";
  if (s <= ra) return "A saída deve ser depois do retorno do almoço.";
  if (s <= e) return "O horário de saída não pode ser anterior ou igual ao de entrada.";
  return null;
}

function jornadaMinutos(colaborador) {
  var e = toMinutes(colaborador.entrada), sa = toMinutes(colaborador.saidaAlmoco);
  var ra = toMinutes(colaborador.retornoAlmoco), s = toMinutes(colaborador.saida);
  return (s - e) - (ra - sa);
}

function jornadaSemanalMinutos(colaborador) {
  var dias = (colaborador.dias && colaborador.dias.length) ? colaborador.dias : [1, 2, 3, 4, 5];
  return jornadaMinutos(colaborador) * dias.length;
}

/** weekday: 0=domingo..6=sábado, igual ao Date.getUTCDay() para uma data "YYYY-MM-DD". */
function weekdayDeData(isoData) {
  // Interpreta a data como UTC pura (sem hora), evitando bug de fuso horário
  // em que "2026-08-10" vira 09/08 à noite em fusos negativos.
  var d = new Date(isoData + "T00:00:00Z");
  return d.getUTCDay();
}

function calcularRegistro(registro, colaborador) {
  if (!colaborador) {
    return { trabalhadas: 0, jornadaEsperada: 0, saldo: 0, positivo: 0, negativo: 0, diaUtil: false };
  }
  var e = toMinutes(registro.entrada), sa = toMinutes(registro.saidaAlmoco);
  var ra = toMinutes(registro.retornoAlmoco), s = toMinutes(registro.saida);
  var intervalo = ra - sa;
  var trabalhadas = (s - e) - intervalo;

  var weekday = weekdayDeData(registro.data);
  var dias = (colaborador.dias && colaborador.dias.length) ? colaborador.dias : [1, 2, 3, 4, 5];
  var diaUtil = dias.indexOf(weekday) !== -1;
  var jornadaEsperada = diaUtil ? jornadaMinutos(colaborador) : 0;
  var saldo = trabalhadas - jornadaEsperada;

  return {
    trabalhadas: trabalhadas,
    jornadaEsperada: jornadaEsperada,
    saldo: saldo,
    positivo: saldo > 0 ? saldo : 0,
    negativo: saldo < 0 ? -saldo : 0,
    diaUtil: diaUtil,
  };
}

function diasResumo(dias) {
  if (!dias || !dias.length) return "sem dias definidos";
  var ordenado = [1, 2, 3, 4, 5, 6, 0].filter(function (d) { return dias.indexOf(d) !== -1; });
  if (dias.length === 5 && [1, 2, 3, 4, 5].every(function (d) { return dias.indexOf(d) !== -1; })) return "seg-sex";
  return ordenado.map(function (d) { return DIAS_NOME[d]; }).join(", ");
}

/**
 * colaboradores: array de {id, ...}
 * registros/ajustes: arrays já filtrados pelo período desejado
 * Retorna { [colaboradorId]: {positivo, negativo, ajustes, dias} }
 */
function agregarPorColaborador(colaboradores, registros, ajustes) {
  var mapa = {};
  var colabPorId = {};
  colaboradores.forEach(function (c) {
    mapa[c.id] = { positivo: 0, negativo: 0, ajustes: 0, dias: 0 };
    colabPorId[c.id] = c;
  });

  registros.forEach(function (reg) {
    var bucket = mapa[reg.colaboradorId];
    if (!bucket) return;
    var calc = calcularRegistro(reg, colabPorId[reg.colaboradorId]);
    bucket.positivo += calc.positivo;
    bucket.negativo += calc.negativo;
    bucket.dias += 1;
  });

  ajustes.forEach(function (aj) {
    var bucket = mapa[aj.colaboradorId];
    if (!bucket) return;
    bucket.ajustes += aj.tipo === "credito" ? aj.minutos : -aj.minutos;
  });

  return mapa;
}

function saldoBancoHorasMinutos(colaborador, registros, ajustes) {
  var mapa = agregarPorColaborador([colaborador], registros, ajustes);
  var stats = mapa[colaborador.id] || { positivo: 0, negativo: 0, ajustes: 0 };
  return stats.positivo - stats.negativo + stats.ajustes;
}

/**
 * Extrato cronológico do banco de horas: cada dia de ponto + cada ajuste
 * manual, com saldo acumulado após cada lançamento.
 */
function extratoBancoHoras(colaborador, registros, ajustes) {
  var eventos = [];
  registros.forEach(function (reg) {
    var calc = calcularRegistro(reg, colaborador);
    if (!calc.diaUtil && calc.saldo === 0) return;
    eventos.push({ data: reg.data, tipo: "ponto", descricao: "Ponto registrado", minutos: calc.saldo });
  });
  ajustes.forEach(function (aj) {
    eventos.push({
      data: aj.data,
      tipo: aj.tipo === "credito" ? "ajuste_credito" : "ajuste_debito",
      descricao: aj.motivo,
      minutos: aj.tipo === "credito" ? aj.minutos : -aj.minutos,
    });
  });

  eventos.sort(function (a, b) {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    return a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0;
  });

  var acumulado = 0;
  return eventos.map(function (ev) {
    acumulado += ev.minutos;
    return {
      data: ev.data, tipo: ev.tipo, descricao: ev.descricao, minutos: ev.minutos,
      valor: minutesToSignedHHMM(ev.minutos),
      acumulado: acumulado,
      acumuladoFmt: minutesToSignedHHMM(acumulado),
    };
  });
}

function parseHorasInput(texto) {
  if (!texto) return null;
  texto = texto.trim();
  var m = texto.match(/^(\d{1,4}):([0-5]\d)$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (/^\d{1,4}$/.test(texto)) return parseInt(texto, 10) * 60;
  return null;
}

// Exporta para Node (testes) e para o browser (window global).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    toMinutes, minutesToHHMM, minutesToSignedHHMM, validarHorarios, jornadaMinutos,
    jornadaSemanalMinutos, weekdayDeData, calcularRegistro, diasResumo,
    agregarPorColaborador, saldoBancoHorasMinutos, extratoBancoHoras, parseHorasInput,
  };
}
