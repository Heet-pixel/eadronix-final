// student-parent/js/attendanceChart.js
//
// Spec item 9: attendance graph on the Dashboard and on the Attendance
// overview — grouped by month, covering all subjects, with the average
// percentage shown prominently top-right (matching the reference "Weekly
// Attendance Record" image: a bar chart of attendance over time + a
// donut/pie summarizing the overall present/absent split).
//
// Works off the same `subjects` array the Attendance page already gets from
// GET /api/student/attendance — each subject carries a `records` array of
// individually dated attendance entries, so everything here is computed
// client-side with no extra backend calls.

const AttendanceChart = {
  _charts: {}, // canvas id -> Chart.js instance, so we can destroy+recreate on reload

  /**
   * Groups every attendance record (across all subjects) by "Mon YYYY" and
   * returns [{ label, percentage, present, total }], oldest to newest.
   */
 _bySubject(subjects) {
    return (subjects || []).map(s => ({
        name: s.subject?.name || "Unknown",
        percentage: Number(s.percentage || 0),
        present: Number(s.present || 0),
        absent: Number(s.absent || 0),
        total: Number(s.total || 0)
    }));
},
  _overall(subjects) {
    let present = 0,
      total = 0;
    for (const s of subjects || []) {
      present += s.present || 0;
      total += s.total || 0;
    }
    return {
      present,
      total,
      percentage: total ? Math.round((present / total) * 100) : 0,
    };
  },

  /**
   * Renders both charts + the average badge into a container.
   * @param {string} containerId - element to fill with the chart markup.
   * @param {Array} subjects - the subjects array from GET /student/attendance.
   * @param {boolean} compact - smaller version for the Dashboard card.
   */
  render(containerId, subjects, compact = false) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (typeof Chart === "undefined") {
      el.innerHTML = ""; // Chart.js failed to load (offline/CDN blocked) — fail quietly, rest of the app still works
      return;
    }

    const monthly = this._byMonth(subjects);
    const overall = this._overall(subjects);
    const barId = containerId + "-bar";
    const pieId = containerId + "-pie";
    const h = compact ? 140 : 220;

    el.innerHTML = `
      <div class="att-chart-card">
        <div class="att-chart-head">
          <div class="att-chart-title">${compact ? "Attendance Overview" : "Monthly Attendance — All Subjects"}</div>
          <div class="att-chart-avg">
            <span class="att-chart-avg-num" style="color:${overall.percentage < 75 ? "#dc2626" : "#16a34a"}">${overall.percentage}%</span>
            <span class="att-chart-avg-label">Average</span>
          </div>
        </div>
        <div class="att-chart-body ${compact ? "compact" : ""}">
          <div class="att-chart-bar-wrap"><canvas id="${barId}" height="${h}"></canvas></div>
          ${monthly.length ? `<div class="att-chart-pie-wrap"><canvas id="${pieId}" height="${h}"></canvas></div>` : ""}
        </div>
        ${!monthly.length ? '<p style="text-align:center;color:var(--clr-text3,#9aa3bf);font-size:12px;margin:10px 0 0">Not enough dated attendance yet to chart by month.</p>' : ""}
      </div>`;

    this._destroy(barId);
    this._destroy(pieId);

    if (!monthly.length) return;

    const barCtx = document.getElementById(barId)?.getContext("2d");
    if (barCtx) {
      this._charts[barId] = new Chart(barCtx, {
        type: "bar",
        data: {
          labels: monthly.map((m) => m.label),
          datasets: [
            {
              label: "Attendance %",
              data: monthly.map((m) => m.percentage),
              backgroundColor: monthly.map((m) =>
                m.percentage < 75 ? "#f87171" : "#4f8cf7",
              ),
              borderRadius: 6,
              maxBarThickness: 42,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) =>
                  `${c.parsed.y}% (${monthly[c.dataIndex].present}/${monthly[c.dataIndex].total})`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { callback: (v) => v + "%" },
            },
          },
        },
      });
    }

    const pieCtx = document.getElementById(pieId)?.getContext("2d");
    if (pieCtx) {
      this._charts[pieId] = new Chart(pieCtx, {
        type: "doughnut",
        data: {
          labels: ["Present", "Absent"],
          datasets: [
            {
              data: [
                overall.present,
                Math.max(overall.total - overall.present, 0),
              ],
              backgroundColor: ["#4f8cf7", "#e2e8f0"],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "65%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { boxWidth: 10, font: { size: 11 } },
            },
          },
        },
      });
    }
  },

  _destroy(id) {
    if (this._charts[id]) {
      this._charts[id].destroy();
      delete this._charts[id];
    }
  },
};
