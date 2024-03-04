import { useUser } from '@/Domain/userContext';
import { useEffect, useState, useRef } from 'react';
import { Chart as ChartJS, Colors, registerables } from 'chart.js';
import { Bar, getElementsAtEvent, getDatasetAtEvent, getElementAtEvent } from 'react-chartjs-2';
import Loading from './loading';

export default function Graph({ setMonth, setIsModalOpen }) {
    const { months } = useUser();
    const [chartData, setChartData] = useState();
    const chartRef = useRef()
    ChartJS.register(...registerables);

    const colors = ['#BB86FC', "#03DAC5", '#610C9F', '#E3651D', '#005B41', '#4477CE']


    useEffect(() => {
        if (months) {
            const orderedMonths = months.sort((a, b) => {
                const [monthA, yearA] = a.date.split('/').map(Number);
                const [monthB, yearB] = b.date.split('/').map(Number);

                if (yearA !== yearB) {
                    return yearA - yearB;
                } else {
                    return monthA - monthB;
                }
            });

            setChartData({
                labels: orderedMonths.map((month) => month.date),
                datasets: [
                    {
                        label: 'Budgets',
                        data: orderedMonths.map((month) => month.budget),
                        backgroundColor: '#CF6679',
                        borderRadius: 10,
                    },
                    {
                        label: 'Gastos',
                        data: orderedMonths.map((month) => month.spent),
                        backgroundColor: colors,
                        borderColor: '#FFFFFF',
                        borderRadius: 10
                    },

                ]
            })
        }
    }, [months]);

    function handleClick(event) {
        if (getElementsAtEvent(chartRef.current, event)[0]) {
            setMonth(months[getElementsAtEvent(chartRef.current, event)[0].index])
            setIsModalOpen(true)
        } else {
            setMonth()
        }
    }

    function handleMonth() {
        setMonth({})
        setIsModalOpen(true)
    }

    return (
        <div className="w-11/12 h-[95%] p-5 py-10 rounded-xl bg-Primary flex flex-col items-center justify-center border-[2px]">
            {!months || months.length === 0 || !chartData?.labels || chartData.labels.length === 0 || !chartData.datasets[0].data.length ? (
                <Loading />
            ) : (
                <>
                    <Bar
                        ref={chartRef}
                        onClick={handleClick}
                        data={chartData}
                        options={{
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        color: 'white',
                                    },
                                },
                                x: {
                                    ticks: {
                                        color: 'white',
                                    },
                                },
                            },
                            plugins: {
                                legend: {
                                    labels: {
                                        color: 'white',
                                    },
                                },

                            },
                            responsive: true,
                            maintainAspectRatio: false,
                        }}
                    />


                    <div className='w-full h-0 flex justify-end mb-4 text-black font-bold'>
                        <button onClick={handleMonth} className='button px-3'>Criar Mes</button>
                    </div>

                </>
            )}
        </div>
    );
}
