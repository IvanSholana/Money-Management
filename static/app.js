const palette = ["#2f6fed", "#159a9c", "#16855b", "#b7791f", "#bc3b4a", "#6d5bd0"];

function formatMoney(value) {
  return `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = canvas.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { ctx, width: rect.width, height: canvas.height / ratio };
}

function drawEmpty(ctx, width, height, text) {
  ctx.fillStyle = "#6b7280";
  ctx.font = "14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);
}

function drawBarChart(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  if (!labels.length) {
    drawEmpty(ctx, width, height, "Belum ada data");
    return;
  }

  const left = 120;
  const right = 16;
  const top = 16;
  const rowHeight = Math.min(34, (height - top - 20) / labels.length);
  const max = Math.max(...values, 1);

  labels.forEach((label, index) => {
    const y = top + index * rowHeight;
    const barWidth = ((width - left - right) * values[index]) / max;
    ctx.fillStyle = "#1d2433";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(label.slice(0, 18), 12, y + 18);
    ctx.fillStyle = palette[index % palette.length];
    ctx.fillRect(left, y + 5, barWidth, 14);
    ctx.fillStyle = "#6b7280";
    ctx.fillText(formatMoney(values[index]), left + barWidth + 8, y + 17);
  });
}

function drawBudgetChart(canvasId, labels, budget, spent) {
  const canvas = document.getElementById(canvasId);
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  if (!labels.length) {
    drawEmpty(ctx, width, height, "Belum ada budget");
    return;
  }

  const left = 120;
  const right = 18;
  const top = 14;
  const rowHeight = Math.min(42, (height - top - 20) / labels.length);
  const max = Math.max(...budget, ...spent, 1);

  labels.forEach((label, index) => {
    const y = top + index * rowHeight;
    const budgetWidth = ((width - left - right) * budget[index]) / max;
    const spentWidth = ((width - left - right) * spent[index]) / max;
    ctx.fillStyle = "#1d2433";
    ctx.font = "12px system-ui";
    ctx.fillText(label.slice(0, 18), 12, y + 20);
    ctx.fillStyle = "#d9dee8";
    ctx.fillRect(left, y + 4, budgetWidth, 12);
    ctx.fillStyle = spent[index] > budget[index] ? "#bc3b4a" : "#16855b";
    ctx.fillRect(left, y + 20, spentWidth, 12);
  });
}

function renderCharts() {
  const data = window.dashboardData || {};
  drawBarChart("expenseChart", data.categories || [], data.expenses || []);
  drawBudgetChart("budgetChart", data.budgetCategories || [], data.budget || [], data.spent || []);
}

window.addEventListener("load", renderCharts);
window.addEventListener("resize", renderCharts);
