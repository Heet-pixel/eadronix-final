const AttendanceChart = {
    _charts: {},

    _bySubject(subjects) {
        return (subjects || []).map((s) => ({
            name: s.name || s.subject?.name || "Unknown",
            percentage: Number(s.percentage || 0),
            present: Number(s.present || 0),
            absent: Number(s.absent || 0),
            total: Number(s.total || 0),
        }));
    },

    _overall(subjects) {
        let present = 0;
        let total = 0;

        (subjects || []).forEach((s) => {
            present += Number(s.present || 0);
            total += Number(s.total || 0);
        });

        return {
            present,
            total,
            percentage: total ? Math.round((present / total) * 100) : 0,
        };
    },

    render(containerId, subjects, compact = false) {

        const el = document.getElementById(containerId);
        if (!el) return;

        if (typeof Chart === "undefined") {
            el.innerHTML = "";
            return;
        }

        const chartData = this._bySubject(subjects);
        const overall = this._overall(subjects);

        const barId = containerId + "-bar";

        this._destroy(barId);

        if (!chartData.length) {
            el.innerHTML = `
                <div class="att-chart-card">
                    <h3 style="text-align:center;padding:30px;">
                        No Attendance Data Found
                    </h3>
                </div>
            `;
            return;
        }

        const h = compact ? 230 : 330;

        el.innerHTML = `
            <div class="att-chart-card">

                <div class="att-chart-head">

                    <div class="att-chart-title">
                        Subject Attendance
                    </div>

                    <div class="att-chart-avg">

                        <span
                            class="att-chart-avg-num"
                            style="color:${overall.percentage >= 75 ? "#16a34a" : "#dc2626"}">

                            ${overall.percentage}%

                        </span>

                        <span class="att-chart-avg-label">
                            Overall
                        </span>

                    </div>

                </div>

                <div class="att-chart-body">
                    <canvas id="${barId}" height="${h}"></canvas>
                </div>

            </div>
        `;

        const ctx = document.getElementById(barId)?.getContext("2d");

        if (!ctx) return;

        this._charts[barId] = new Chart(ctx, {

            type: "bar",

            data: {

                labels: chartData.map(s => s.name),

                datasets: [

                    {

                        label: "Attendance %",

                        data: chartData.map(s => s.percentage),

                        backgroundColor: chartData.map((s) => {

                            if (s.percentage >= 75) return "#16a34a";

                            if (s.percentage >= 60) return "#f59e0b";

                            return "#dc2626";

                        }),

                        borderRadius: 8,

                        barThickness:
                            window.innerWidth < 480
                                ? 20
                                : window.innerWidth < 768
                                ? 28
                                : 50,

                        maxBarThickness: 50,

                        categoryPercentage: 0.7,

                        barPercentage: 0.8

                    }

                ]

            },

            options: {

    responsive: true,

    maintainAspectRatio: false,

    layout: {
        padding: 8
    },

    plugins: {

        legend: {
            display: false
        },

        tooltip: {

            callbacks: {

                label(context) {

                    const s = chartData[context.dataIndex];

                    return `${s.percentage}% (${s.present}/${s.total})`;

                }

            }

        }

    },

    scales: {

        y: {

            beginAtZero: true,

            max: 100,

            ticks: {

                stepSize: 10,

                callback(value) {
                    return value + "%";
                },

                font: {
                    size: window.innerWidth < 480 ? 9 : 11
                }

            }

        },

        x: {

            offset: true,

            ticks: {

                autoSkip: true,

                maxTicksLimit: 6,

                maxRotation: 35,

                minRotation: 35,

                font: {
                    size: window.innerWidth < 480 ? 9 : 11
                }

            },

            grid: {
                display: false
            }

        }

    }

}

        });

        window.addEventListener("resize", () => {
            if (this._charts[barId]) {
                this._charts[barId].resize();
            }
        });

    },

    _destroy(id) {

        if (this._charts[id]) {

            this._charts[id].destroy();

            delete this._charts[id];

        }

    }

};