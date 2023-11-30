import { useUser } from '@/Domain/userContext';
import { useEffect, useState, useRef } from 'react';
import { Chart as ChartJS, Colors, registerables } from 'chart.js';
import { Bar, getElementsAtEvent, getDatasetAtEvent } from 'react-chartjs-2';
import Loading from './loading';

export default function Graph({ setMonth, setIsModalOpen }) {
    const { months } = useUser();
    const [chartData, setChartData] = useState();
    const chartRef = useRef()
    ChartJS.register(...registerables);

    const colors = ['#BB86FC', "#03DAC5", "#CF6679"]


    useEffect(() => {
        if (months) {
            const orderedMonths = months.sort((a, b) => {
                const monthA = parseInt(a.date.split('/')[0]);
                const monthB = parseInt(b.date.split('/')[0]);
                return monthA - monthB;
            });

            setChartData({
                labels: orderedMonths.map((month) => month.date),
                datasets: [
                    {
                        label: 'Price',
                        data: orderedMonths.map((month) => month.spent),
                        backgroundColor: colors,
                        borderColor: '#FFFFFF',
                        borderRadius: 10
                    },
                ],
            });
        }
    }, [months]);

    function handleClick(event) {
        if (getElementsAtEvent(chartRef.current, event)[0]) {
            setMonth(months[getElementsAtEvent(chartRef.current, event)[0].index])
            setIsModalOpen(true)
        }
    }

    function handleMonth() {
        setMonth({})
        setIsModalOpen(true)
    }

    return (
        <div className="w-11/12 h-[90%] p-5 rounded-xl bg-Primary flex flex-col items-center justify-center">
            {!months || months.length === 0 || !chartData.labels || chartData.labels.length === 0 || !chartData.datasets[0].data.length ? (
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

                </>
            )}
            <div className='w-full h-10 flex justify-end mb-4 text-black font-bold'>
                <span onClick={() => handleMonth()} className="h-10 hover:scale-125 transition-all duration-300 ease-out w-10 p-0 rounded-full bg-Secundary flex items-center justify-center cursor-pointer ">+</span>
            </div>
        </div>
    );
}
