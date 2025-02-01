import React, { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { tag } from "./App";
import { loadTag } from "./Network";
import Select from "react-select"
import ChartDataLabels from 'chartjs-plugin-datalabels';
import zoomPlugin from 'chartjs-plugin-zoom';
Chart.register(ChartDataLabels);
Chart.register(zoomPlugin);

const AttributePanel = ({ value, setValue, options }) => {
    return (
        <div className="mx-2 border border-gray-300 dark:border-gray-600 rounded relative">
            <Select
                options={options}
                unstyled={true}
                value={value}
                onChange={setValue}
                isMulti={false}
                styles={{
                    control: (base) => ({
                        ...base,
                        height: 30,
                        minHeight: 30,
                        padding: '0 8px',
                        backgroundColor: "var(--bg-color)",
                        border: "none",
                        cursor: "pointer",
                    }),
                    menu: (base) => ({
                        ...base,
                        position: 'absolute',
                        backgroundColor: "var(--bg-color)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "4px",
                        marginTop: "4px",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                        zIndex: 9999,
                        overflow: 'hidden',
                    }),
                    menuList: (base) => ({
                        ...base,
                        backgroundColor: "var(--bg-color)",
                    }),
                    option: (base, state) => ({
                        ...base,
                        padding: "8px 12px",
                        cursor: "pointer",
                        backgroundColor: state.isFocused 
                            ? "var(--hover-bg-color)"
                            : "var(--bg-color)",
                        "&:hover": {
                            backgroundColor: "var(--hover-bg-color)",
                        },
                    }),
                    singleValue: (base) => ({
                        ...base,
                        padding: 0,
                        margin: 0,
                        color: "var(--text-color)",
                    }),
                }}
                theme={(theme) => ({
                    ...theme,
                    colors: {
                        ...theme.colors,
                        primary: 'var(--text-color)',
                        primary25: 'var(--hover-bg-color)',
                    },
                })}
            />
        </div>
    );
}


import Chart from 'chart.js/auto';

const GraphInner = () => {
    const options = tag.value.attributes.map((attr) => {
        return { value: attr, label: ":" + attr.title + " (" + attr.votes + ")" }
    });
    const [attribute1, setAttribute1] = useState(options[0]);
    const [attribute2, setAttribute2] = useState(options[1]);
    const [location, setLocation] = useLocation();
    const [isZoomed, setIsZoomed] = useState(false);

    useEffect(() => {
        var chart;
        async function load() {
            const data1r = await fetch("/api/tag/page?id=" + tag.value.tag.id + "&attribute=" + attribute1.value.title);
            const data1 = await data1r.json();

            const data2r = await fetch("/api/tag/page?id=" + tag.value.tag.id + "&attribute=" + attribute2.value.title);
            const data2 = await data2r.json();
            console.log(data1);
            console.log(data2);

            const data1_by_id = {};
            for (let item of data1.sorted) {
                data1_by_id[item.id] = item;
            }
            const data = []
            for (let item of data2.sorted) {
                if (data1_by_id[item.id]) {
                    data.push({ 
                        x: data1_by_id[item.id].elo, 
                        y: item.elo, 
                        label: item.title,
                        id: item.id
                    });
                }
            }
            const ctx = document.getElementById('myChart');
            chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'X vs Y',
                        data: data,
                        pointBackgroundColor: 'rgba(255, 99, 132, 1)',
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        pointStyle: 'circle',
                        pointHitRadius: 10,
                    }]
                },
                options: {
                    onClick: (event, elements) => {
                        if (elements.length > 0) {
                            const dataIndex = elements[0].index;
                            const clickedPoint = data[dataIndex];
                            window.location.href = `/${tag.value.tag.id}/${tag.value.tag.slug}?item=${clickedPoint.id}`;
                        }
                    },
                    onHover: (event, elements) => {
                        document.body.style.cursor = elements.length ? 'pointer' : 'default';
                    },
                    plugins: {
                        tooltip: {
                            itemSort: function(a, b) {
                                const distA = Math.sqrt(
                                    Math.pow(a.chart.tooltip.caretX - a.element.x, 2) + 
                                    Math.pow(a.chart.tooltip.caretY - a.element.y, 2)
                                );
                                const distB = Math.sqrt(
                                    Math.pow(b.chart.tooltip.caretX - b.element.x, 2) + 
                                    Math.pow(b.chart.tooltip.caretY - b.element.y, 2)
                                );
                                return distA - distB;
                            },
                            callbacks: {
                                title: function(tooltipItems) {
                                    return tooltipItems[0] ? data[tooltipItems[0].dataIndex].label : '';
                                },
                                label: function(tooltipItem) {
                                    const item = data[tooltipItem.dataIndex];
                                    return `(${item.x.toFixed(3)}, ${item.y.toFixed(3)})`;
                                },
                            },
                            filter: function(tooltipItem) {
                                const dx = tooltipItem.chart.tooltip.caretX - tooltipItem.element.x;
                                const dy = tooltipItem.chart.tooltip.caretY - tooltipItem.element.y;
                                const distance = Math.sqrt(dx * dx + dy * dy);
                                
                                return distance < 50 && 
                                    tooltipItem.dataIndex === tooltipItem.dataset.data.indexOf(tooltipItem.dataset.data[tooltipItem.dataIndex]);
                            },
                            displayColors: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 10,
                            titleFont: {
                                size: 14,
                                weight: 'bold'
                            },
                            bodyFont: {
                                size: 13
                            },
                            bodySpacing: 4,
                            mode: 'nearest',
                            intersect: false
                        },
                        datalabels: {
                            display: function(context) {
                                const index = context.dataIndex;
                                const dataset = context.dataset;
                                const currentPoint = dataset.data[index];
                                let showLabel = true;
                                
                                dataset.data.forEach((point, i) => {
                                    if (i !== index) {
                                        const dx = point.x - currentPoint.x;
                                        const dy = point.y - currentPoint.y;
                                        const distance = Math.sqrt(dx * dx + dy * dy);
                                        if (distance < 0.2) {
                                            showLabel = false;
                                        }
                                    }
                                });
                                return showLabel;
                            },
                            color: 'rgba(0, 0, 0, 0.7)',
                            font: {
                                size: 11
                            },
                            formatter: function(value, context) {
                                return value.label.length > 20 ? value.label.substring(0, 20) + '...' : value.label;
                            },
                            anchor: 'end',
                            align: 'top'
                        },
                        zoom: {
                            limits: {
                                x: {min: 'original', max: 'original'},
                                y: {min: 'original', max: 'original'}
                            },
                            pan: {
                                enabled: true,
                                mode: 'xy',
                            },
                            zoom: {
                                wheel: {
                                    enabled: true,
                                },
                                pinch: {
                                    enabled: true,
                                    speed: 0.05,
                                    threshold: 10
                                },
                                mode: 'xy',
                                onZoomComplete: ({ chart }) => {
                                    setIsZoomed(true);
                                }
                            }
                        }
                    }
                },
            });
        }
        load();
        return () => {
            chart.destroy();
            console.log('closing')
        }
    }, [attribute1, attribute2])


    return <div className="text-xl flex flex-col items-center dark:text-white text-black p-4">
        <div className="flex flex-row mb-4">
            graph of <div className="bg-purple-200 dark:bg-purple-950 mx-1">
                #{tag.value.tag.slug}
            </div>
        </div>
        <div className="text-xl flex flex-row items-center mb-4">
            x axis:
            <AttributePanel value={attribute1} setValue={setAttribute1} options={options} />
            y axis:
            <AttributePanel value={attribute2} setValue={setAttribute2} options={options} />
        </div>

        <div className="relative w-full">
            <canvas id="myChart" className="max-w-full" />
            {isZoomed && (
                <button
                    onClick={() => {
                        const chart = Chart.getChart("myChart");
                        chart.resetZoom();
                        setIsZoomed(false);
                    }}
                    className="absolute bottom-4 right-4 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-black dark:text-white px-3 py-1 rounded-md text-sm transition-colors"
                >
                    reset zoom
                </button>
            )}
        </div>
    </div>;
}

export const Graph = ({ tagid }) => {
    useEffect(() => {
        loadTag(tagid);
    }, [])
    if (tag.value === null) {
        return <h1> loading... </h1>;
    } else {
        return <GraphInner />
    }

};
