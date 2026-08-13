/*
 * Cálculo do "distrato" de Prestadores PJ — DELIBERADAMENTE diferente do
 * cálculo de rescisão CLT (calculo-rescisao.js).
 *
 * Prestador PJ é regido pelo Código Civil (contrato de prestação de
 * serviços), não pela CLT. Por isso este arquivo NÃO calcula nenhuma verba
 * trabalhista: sem aviso prévio proporcional automático, sem 13º salário,
 * sem férias + 1/3, sem multa de FGTS. Calcular essas verbas para um PJ
 * reforçaria o risco de "pejotização" (caracterização de vínculo
 * empregatício disfarçado) — o mesmo motivo pelo qual a aba de "férias" de
 * PJ é só uma agenda de indisponibilidade, não um cálculo de férias CLT.
 *
 * O único valor calculado aqui é o proporcional de honorários do mês do
 * encerramento (dias corridos do mês até a data de encerramento, dividido
 * pelos dias do mês, vezes o honorário mensal) — um cálculo civil comum de
 * qualquer prestação de serviço contínua, não uma verba trabalhista.
 * Qualquer outro valor (multa contratual, aviso combinado etc.) depende
 * apenas do que está escrito no contrato entre as partes — não é
 * automático, e por isso o "aviso combinado" é um campo livre preenchido
 * por quem lança o distrato, não uma fórmula.
 */

var MOTIVOS_DISTRATO_PJ = {
  distrato_amigavel: "Distrato amigável (mútuo acordo)",
  quebra_contrato: "Rescisão por quebra de contrato",
  termino_prazo: "Término natural do prazo contratual",
};

function diasNoMesDe(isoData) {
  var partes = isoData.split("-");
  var ano = Number(partes[0]), mes = Number(partes[1]);
  // dia 0 do mês seguinte = último dia do mês atual
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * dataEncerramento: "YYYY-MM-DD"
 * valorHonorarioMensal: número
 * Retorna o proporcional de honorários do mês do encerramento, calculado
 * por dias corridos (não é uma fórmula CLT) — do dia 1 até a data
 * informada.
 */
function calcularHonorarioProporcionalPJ(dataEncerramento, valorHonorarioMensal) {
  var partes = dataEncerramento.split("-");
  var diaEncerramento = Number(partes[2]);
  var diasNoMes = diasNoMesDe(dataEncerramento);
  var valorMensal = Number(valorHonorarioMensal) || 0;
  var proporcional = (valorMensal / diasNoMes) * diaEncerramento;
  return {
    diaEncerramento: diaEncerramento,
    diasNoMes: diasNoMes,
    valorMensal: valorMensal,
    proporcional: Math.round(proporcional * 100) / 100,
  };
}

// Exporta para Node (testes) e para o browser (window global).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { MOTIVOS_DISTRATO_PJ, diasNoMesDe, calcularHonorarioProporcionalPJ };
}
