"use strict";
(() => {
  const data = window.CFFG_DATA;
  const i18n = window.CFFG_I18N;
  const error = document.getElementById("data-error");
  if (!data?.runs?.length || !Array.isArray(data.previous_test_results)) {
    const showError = () => { error.textContent = i18n.t("missing"); error.hidden = false; };
    showError();
    document.addEventListener("cffg-language-change", showError);
    return;
  }
  const number = (value, digits = 3) => Number(value).toFixed(digits);
  data.runs.forEach(({summary}) => {
    const key = summary.run_id.split("-")[0];
    const card = document.querySelector(`.video-card[data-run="${key}"]`);
    if (!card) return;
    card.querySelector(`#baseline-${key}`).textContent = `${number(summary.metrics.baseline.rmse_m)} m`;
    card.querySelector(`#cffg-${key}`).textContent = `${number(summary.metrics.cffg.rmse_m)} m`;
    card.querySelector(`#gain-${key}`).textContent = `${number(summary.rmse_improvement_percent, 1)}%`;
  });
  const body = document.getElementById("results-body");
  data.previous_test_results.forEach(row => {
    const tr = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = row.run_id;
    tr.appendChild(heading);
    [number(row.baseline), number(row.cffg), `${number(100 * (1 - row.cffg / row.baseline), 1)}%`,
      number(row.baseline_p95), number(row.cffg_p95)].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
})();
