import React, { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { tag } from "./App";
import { loadTag } from "./Network";
import Select from "react-select"

const AttributePanel = ({ value, setValue, options }) => {
    return <div className="border-4 border-green-400"
        style={{ borderStyle: 'double' }}
    >
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
                    padding: 0,
                    margin: 0,
                    backgroundColor: "#181a1b",
                    border: 2,
                    borderStyle: "none",
                }),
                menu: (base) => ({
                    ...base,
                    backgroundColor: "#181a1b",
                    border: 2,
                    borderStyle: "solid",
                    borderColor: "lavender",
                }),
                singleValue: (base) => ({
                    ...base,
                    padding: 0,
                    margin: 0,
                }),
            }}
        />
    </div>
}


import Chart from 'chart.js/auto';

const GraphInner = () => {
    const options = tag.value.attributes.map((attr) => {
        return { value: attr, label: ":" + attr.title + " (" + attr.votes + ")" }
    });
    const [attribute1, setAttribute1] = useState(options[0]);
    const [attribute2, setAttribute2] = useState(options[1]);
    const [location, setLocation] = useLocation();

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
                    data.push({ x: data1_by_id[item.id].elo, y: item.elo, label: item.title });
                }
            }
            const ctx = document.getElementById('myChart');
            chart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'X vs Y',
                        data: data,
                        pointBackgroundColor: 'rgba(255, 99, 132, 1)'
                    }]
                },
                options: {
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    return ctx.dataset.data[ctx.dataIndex].label
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


    return <div className="text-xl flex flex-col items-center text-white">
        <div className="flex flex-row cursor-pointer" onClick={() => setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug)}>
            graph of <div className="bg-purple-950">
                #{tag.value.tag.slug}
            </div>
        </div>
        <div className="text-xl flex flex-row">
            x axis:
            <AttributePanel value={attribute1} setValue={setAttribute1} options={options} />
            y axis:
            <AttributePanel value={attribute2} setValue={setAttribute2} options={options} />
        </div>

        <canvas id="myChart" />

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
