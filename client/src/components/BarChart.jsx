import { useEffect, useRef } from "react";
import * as echarts from "echarts";

// A small wrapper around ECharts: it keeps the chart in step with the data and
// with the width of the phone, and disposes of it when the screen changes.
export default function BarChart({ labels, values, colour, height = 140, unit = "min" }) {
  const holder = useRef(null);

  useEffect(() => {
    const chart = echarts.init(holder.current, null, { renderer: "svg" });

    chart.setOption({
      animation: false,
      textStyle: { fontFamily: "Nunito, sans-serif" },
      grid: { left: 0, right: 0, top: 8, bottom: 18, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value) => value + " " + unit,
        backgroundColor: "#3a2f2a",
        borderWidth: 0,
        textStyle: { color: "#fbf4ea", fontWeight: 700 },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#e3d6c4" } },
        axisLabel: {
          color: "#7a6a60",
          fontSize: 11,
          fontWeight: 700,
          interval: (index) => index === 0 || index === labels.length - 1,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          type: "bar",
          data: values,
          barMaxWidth: 18,
          itemStyle: { color: colour, borderRadius: [6, 6, 0, 0] },
        },
      ],
    });

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [labels, values, colour, unit]);

  return <div ref={holder} style={{ width: "100%", height }} />;
}
