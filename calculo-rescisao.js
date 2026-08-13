/*
 * Calculadora de rescisão — porta de calculo_rescisao.py.
 *
 * *** AVISO IMPORTANTE ***
 * Calcula valores BRUTOS de: saldo de salário, aviso prévio, férias
 * (vencidas e proporcionais + 1/3 constitucional), 13º salário proporcional
 * e a quitação financeira do banco de horas.
 *
 * NÃO inclui FGTS (depósito mensal de 8% e multa de 40% em caso de dispensa
 * sem justa causa), nem descontos de INSS e IRRF, nem convenções coletivas
 * específicas, nem redução de férias por faltas injustificadas.
 *
 * Valores de apoio — sempre confira com um contador ou profissional de RH
 * antes de efetuar qualquer pagamento real.
 *
 * Depende de calculo-ferias.js (deve ser carregado antes deste arquivo).
 */

var TIPOS_RESCISAO = {
  sem_justa_causa: "Dispensa sem justa causa",
  pedido_demissao: "Pedido de demissão (pelo colaborador)",
  justa_causa: "Dispensa por justa causa",
  acordo_mutuo: "Acordo mútuo (distrato, art. 484-A CLT)",
};

var AVISOS_POR_TIPO = {
  sem_justa_causa: [["trabalhado", "Trabalhado"], ["indenizado", "Indenizado"]],
  pedido_demissao: [["trabalhado", "Cumprido pelo colaborador"], ["nao_cumprido", "Não cumprido (com desconto)"]],
  justa_causa: [["nao_aplicavel", "Não se aplica"]],
  acordo_mutuo: [["indenizado", "Indenizado (pago pela metade)"]],
};

function formataMoeda(valor) {
  var texto = (Math.round(valor * 100) / 100).toFixed(2);
  var partes = texto.split(".");
  var inteiro = partes[0].replace(/^-/, "");
  var sinal = valor < 0 ? "-" : "";
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "R$ " + sinal + inteiro + "," + partes[1];
}

function anosCompletos(inicioIso, fimIso) {
  return Math.max(0, calculoFerias().relativeDelta(inicioIso, fimIso).years);
}

function diasAvisoProporcional(anos) {
  return Math.min(30 + 3 * anos, 90);
}

function horasMensaisEstimadas(colaborador) {
  var jornadaSemanalH = jornadaSemanalMinutos(colaborador) / 60;
  return jornadaSemanalH * (30 / 7);
}

// Pequeno indireto para funcionar tanto no browser (globals) quanto no Node (require).
function calculoFerias() {
  if (typeof module !== "undefined" && module.exports) {
    return require("./calculo-ferias.js");
  }
  return {
    relativeDelta: relativeDelta,
    mesesCompletosFracao: mesesCompletosFracao,
    periodosAquisitivos: periodosAquisitivos,
    addDays: addDays,
  };
}

/**
 * colaborador: {dataAdmissao, salarioBase, entrada, saidaAlmoco, retornoAlmoco, saida, dias}
 * gozos: array de FeriasGozo (para calcular férias vencidas)
 */
function calcularRescisao(colaborador, dataDemissao, tipoRescisao, avisoPrevioTipo, saldoBancoHorasMinutos, gozos) {
  var cf = calculoFerias();
  var salario = colaborador.salarioBase || 0;
  var valorDia = salario / 30;
  var observacoes = [];

  var anos = anosCompletos(colaborador.dataAdmissao, dataDemissao);
  var diasAvisoFull = diasAvisoProporcional(anos);

  var avisoPrevioValor = 0, descontoAviso = 0, dataProjetada = dataDemissao;

  if (tipoRescisao === "justa_causa") {
    observacoes.push("Dispensa por justa causa: sem aviso prévio.");
  } else if (tipoRescisao === "sem_justa_causa") {
    if (avisoPrevioTipo === "indenizado") {
      avisoPrevioValor = valorDia * diasAvisoFull;
      dataProjetada = cf.addDays(dataDemissao, diasAvisoFull);
      observacoes.push(
        "Aviso prévio indenizado: " + diasAvisoFull + " dias (" + formataMoeda(avisoPrevioValor) + "). " +
        "Projeta o contrato até " + formatarDataBR(dataProjetada) + " para cálculo de férias e 13º proporcionais."
      );
    } else {
      observacoes.push("Aviso prévio trabalhado: " + diasAvisoFull + " dias, já remunerados no salário normal do período — sem projeção adicional de data.");
    }
  } else if (tipoRescisao === "pedido_demissao") {
    var diasAvisoPedido = 30;
    if (avisoPrevioTipo === "nao_cumprido") {
      descontoAviso = valorDia * diasAvisoPedido;
      observacoes.push("Colaborador pediu demissão e não cumpriu o aviso prévio: desconto de " + diasAvisoPedido + " dias de salário (" + formataMoeda(descontoAviso) + ").");
    } else {
      observacoes.push("Aviso prévio de 30 dias cumprido pelo colaborador — sem desconto.");
    }
  } else if (tipoRescisao === "acordo_mutuo") {
    var diasAvisoAcordo = Math.floor(diasAvisoFull / 2);
    avisoPrevioValor = valorDia * diasAvisoAcordo;
    dataProjetada = cf.addDays(dataDemissao, diasAvisoAcordo);
    observacoes.push("Acordo mútuo (art. 484-A, CLT): aviso prévio indenizado pago pela metade (" + diasAvisoAcordo + " dias, " + formataMoeda(avisoPrevioValor) + ").");
  }

  // 1) Saldo de salário
  var diasTrabalhadosMes = Number(dataDemissao.split("-")[2]);
  var saldoSalario = valorDia * diasTrabalhadosMes;

  // 2) Férias vencidas (períodos completos com saldo, na data efetiva de saída)
  var periodosVencidas = cf.periodosAquisitivos(colaborador, dataDemissao, gozos);
  var feriasVencidasDias = periodosVencidas
    .filter(function (p) { return p.completo && p.saldo > 0; })
    .reduce(function (soma, p) { return soma + p.saldo; }, 0);
  var feriasVencidasValor = valorDia * feriasVencidasDias;
  var feriasVencidasTerco = feriasVencidasValor / 3;
  if (feriasVencidasDias) {
    observacoes.push("Férias vencidas: " + feriasVencidasDias + " dia(s) de período(s) aquisitivo(s) completos e não gozados, + 1/3 constitucional.");
  }

  // 3) Férias proporcionais (período em curso na data projetada) — Súmula 171 TST: não em justa causa
  var feriasProporcionaisDias = 0;
  if (tipoRescisao !== "justa_causa") {
    var periodosProporcionais = cf.periodosAquisitivos(colaborador, dataProjetada, gozos);
    var periodoAtual = periodosProporcionais[periodosProporcionais.length - 1];
    var mesesPeriodoAtual = cf.mesesCompletosFracao(periodoAtual.inicio, dataProjetada);
    feriasProporcionaisDias = Math.round((mesesPeriodoAtual / 12) * 30 * 100) / 100;
    observacoes.push("Férias proporcionais: " + mesesPeriodoAtual + " mês(es) completos do período aquisitivo em curso (" + feriasProporcionaisDias.toFixed(1) + " dia(s)), + 1/3 constitucional.");
  } else {
    observacoes.push("Dispensa por justa causa: sem férias proporcionais (Súmula 171, TST).");
  }
  var feriasProporcionaisValor = valorDia * feriasProporcionaisDias;
  var feriasProporcionaisTerco = feriasProporcionaisValor / 3;

  // 4) 13º salário proporcional
  var decimoTerceiroMeses = 0;
  if (tipoRescisao !== "justa_causa") {
    var anoRef = Number(dataProjetada.split("-")[0]);
    var inicioAno = anoRef + "-01-01";
    var inicioContagem = colaborador.dataAdmissao > inicioAno ? colaborador.dataAdmissao : inicioAno;
    decimoTerceiroMeses = cf.mesesCompletosFracao(inicioContagem, dataProjetada);
    observacoes.push("13º salário proporcional: " + decimoTerceiroMeses + "/12 avos.");
  } else {
    observacoes.push("Dispensa por justa causa: sem 13º proporcional (entendimento majoritário).");
  }
  var decimoTerceiroValor = salario * (decimoTerceiroMeses / 12);

  // 5) Quitação do banco de horas
  var horasMensais = horasMensaisEstimadas(colaborador) || 1;
  var valorHora = salario / horasMensais;
  var saldoBancoHorasHoras = saldoBancoHorasMinutos / 60;
  var bancoHorasValor = valorHora * saldoBancoHorasHoras;
  if (saldoBancoHorasMinutos > 0) {
    observacoes.push("Banco de horas positivo (" + saldoBancoHorasHoras.toFixed(2) + "h): pago junto com a rescisão (" + formataMoeda(bancoHorasValor) + "), com base no valor-hora estimado de " + formataMoeda(valorHora) + ".");
  } else if (saldoBancoHorasMinutos < 0) {
    observacoes.push("Banco de horas negativo (" + saldoBancoHorasHoras.toFixed(2) + "h): descontado da rescisão (" + formataMoeda(bancoHorasValor) + ").");
  }

  var total = saldoSalario + avisoPrevioValor - descontoAviso
    + feriasVencidasValor + feriasVencidasTerco
    + feriasProporcionaisValor + feriasProporcionaisTerco
    + decimoTerceiroValor + bancoHorasValor;

  return {
    salarioBase: salario, dataDemissao: dataDemissao, dataProjetada: dataProjetada,
    tipoRescisao: tipoRescisao, avisoPrevioTipo: avisoPrevioTipo,
    anosCompletos: anos, diasAvisoPrevio: diasAvisoFull,

    saldoSalario: arred(saldoSalario), diasTrabalhadosMes: diasTrabalhadosMes,
    avisoPrevioValor: arred(avisoPrevioValor), descontoAviso: arred(descontoAviso),

    feriasVencidasDias: feriasVencidasDias, feriasVencidasValor: arred(feriasVencidasValor), feriasVencidasTerco: arred(feriasVencidasTerco),
    feriasProporcionaisDias: feriasProporcionaisDias, feriasProporcionaisValor: arred(feriasProporcionaisValor), feriasProporcionaisTerco: arred(feriasProporcionaisTerco),
    decimoTerceiroMeses: decimoTerceiroMeses, decimoTerceiroValor: arred(decimoTerceiroValor),

    saldoBancoHorasMinutos: saldoBancoHorasMinutos, bancoHorasValor: arred(bancoHorasValor), valorHoraEstimado: arred(valorHora),

    total: arred(total), observacoes: observacoes,
  };
}

function arred(v) { return Math.round(v * 100) / 100; }
function formatarDataBR(iso) {
  var p = iso.split("-");
  return p[2] + "/" + p[1] + "/" + p[0];
}

if (typeof module !== "undefined" && module.exports) {
  var _cf = require("./calculo-ferias.js");
  var _calc = require("./calculo.js");
  relativeDelta = _cf.relativeDelta;
  mesesCompletosFracao = _cf.mesesCompletosFracao;
  periodosAquisitivos = _cf.periodosAquisitivos;
  jornadaSemanalMinutos = _calc.jornadaSemanalMinutos;
  module.exports = {
    TIPOS_RESCISAO, AVISOS_POR_TIPO, formataMoeda, calcularRescisao, formatarDataBR,
  };
}
