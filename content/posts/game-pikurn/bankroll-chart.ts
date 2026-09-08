import type { ApexOptions } from 'apexcharts'

export default {
  series: [
    {
      name: 'Worst Case',
      data: [100, 110, 120, 130, 140, 150, 160, 120, 80, 40, 0],
    },
    {
      name: 'Average Case',
      data: [
        233.33333333333334, 230.0, 226.66666666666666, 223.33333333333334, 220.0,
        216.66666666666666, 213.33333333333334, 210.0, 206.66666666666666, 203.33333333333334,
        200.0,
      ],
    },
    {
      name: 'Best Case',
      data: [400, 360, 320, 280, 280, 300, 320, 340, 360, 380, 400],
    },
  ],

  xaxis: {
    type: 'numeric',
    categories: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    title: {
      text: 'Initial Wager ($)',
    },
    decimalsInFloat: 0,
  },
  yaxis: {
    title: {
      text: 'Bankroll ($)',
    },
    min: 0,
    max: 400,
    decimalsInFloat: 0,
  },

  chart: {
    height: 600,
    type: 'line',
    animations: { enabled: false },
    dropShadow: {
      enabled: true,
      color: '#000',
      top: 18,
      left: 7,
      blur: 10,
      opacity: 0.5,
    },
    zoom: {
      enabled: false,
    },
    toolbar: {
      show: false,
    },
  },
  colors: ['#F00', '#00F', '#0F0'],
  dataLabels: {
    enabled: true,
    formatter: (value: number) => '$' + value.toFixed(0),
  },
  title: {
    text: 'Strategy 2 Expected Bankroll, With Initial Wager',
    align: 'left',
  },

  markers: {
    size: 1,
  },

  legend: {
    position: 'top',
    horizontalAlign: 'right',
    floating: true,
    offsetY: -25,
    offsetX: -5,
  },
  responsive: [
    {
      breakpoint: 600,
      options: {
        chart: { height: 420, dropShadow: { enabled: false } },
        title: {
          text: 'Strategy 2: Expected Bankroll',
          style: { fontSize: '14px' },
        },
        dataLabels: { enabled: false },
        legend: {
          position: 'bottom',
          horizontalAlign: 'center',
          floating: false,
          fontSize: '11px',
          offsetX: 0,
          offsetY: 0,
        },
        xaxis: {
          tickAmount: 5,
          labels: { style: { fontSize: '10px' } },
          title: { style: { fontSize: '12px' } },
        },
        yaxis: {
          tickAmount: 4,
          labels: { style: { fontSize: '10px' } },
          title: { style: { fontSize: '12px' } },
        },
      },
    },
  ],
} satisfies ApexOptions
