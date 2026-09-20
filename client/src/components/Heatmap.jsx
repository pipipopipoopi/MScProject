import { useEffect, useRef } from "react";
import * as echarts from "echarts";

// Weekday by hour grid: the darker the cell, the more minutes of scrolling
// happened in that hour of that day of the week.
export default function Heatmap({ weekdays, hours, values, max }) {
  const holder = useRef(null);

  useEffect(() => {
    const chart = echarts.init(holder.current, null, { renderer: "svg" });

    chart.setOption({
      animation: false,
      textStyle: { fontFamily: "Nunito, sans-serif" },
      grid: { left: 34, right: 4, top: 4, bottom: 22 },
      tooltip: {
        backgroundColor: "#3a2f2a",
        borderWidth: 0,
        textStyle: { color: "#fbf4ea", fontWeight: 700 },
        formatter: (point) =>
          weekdays[point.value[1]] +
          " " +
          String(point.value[0]).padStart(2, "0") +
          ":00 · " +
          point.value[2] +
          " min",
      },
      xAxis: {
        type: "category",
        data: hours,
        splitArea: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: "#7a6a60",
          fontSize: 10,
          fontWeight: 700,
          interval: (index) => index % 6 === 0,
        },
      },
      yAxis: {
        type: "category",
        data: weekdays,
        inverse: true,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: "#7a6a60", fontSize: 11, fontWeight: 700 },
      },
      visualMap: {
        show: false,
        min: 0,
        max: max || 1,
        inRange: { color: ["#f3ebdf", "#e6e0fa", "#c9bdf2", "#a393e3", "#7361c8"] },
      },
      series: [
        {
          type: "heatmap",
          data: values,
          itemStyle: { borderColor: "#fbf4ea", borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { borderColor: "#3a2f2a" } },
        },
      ],
    });

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [weekdays, hours, values, max]);

  return <div ref={holder} style={{ width: "100%", height: 220 }} />;
}
