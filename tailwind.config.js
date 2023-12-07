/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors:{
        "Dark" : '#121212',
        'Primary': '#242526',
        "Secundary": '#BB86FC',
        'Success': '#03DAC5',
        'Error': '#CF6679',
        'tx': 'rgba(255, 255, 255, 0.80)',
      },
      animation:{
        dropTop: 'dropTop 0.2s ease-in',
        notification:'notification 0.3s ease-out'
      },
      keyframes:{
        notification:{
          '0%':{transform:'translateY(-120vh)',opacity:'0'},
          '100%':{transform:'translateY(-30vh)',opacity:'1'}
        },
        dropTop:{
            '0%': {transform: 'translate(50%,50%)', opacity:'0',scale:'0.5' },
            '100%': {transform:'translate(0%,0%)',opacity:'1',scale:'1'}
        },
      }
    },
  },
  plugins: [],
}
