import { useUser } from '@/Domain/userContext';
import { useEffect, useState,useRef } from 'react';
import { Chart as ChartJS, Colors, registerables } from 'chart.js';
import { Bar,getElementsAtEvent,getDatasetAtEvent  } from 'react-chartjs-2';
import Loading from './loading';

export default function Graph({setMonth, setIsModalOpen}) {
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

    function handleClick(event){
        setMonth(months[getElementsAtEvent(chartRef.current,event)[0].index])
        setIsModalOpen(true)
    }

    return (
        <div className="w-11/12 h-[90%] p-5 rounded-xl bg-Primary">
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
        </div>
    );
}
