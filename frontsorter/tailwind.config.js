// tailwind.config.js
module.exports = {
    theme: {
      extend: {
        colors: {
          brand:  { DEFAULT: '#3A7BFF', 50:'#f2f6ff', 100:'#e6edff', 200:'#c4d6ff',
                    300:'#a1beff', 400:'#5c90ff', 500:'#3A7BFF', 600:'#2e60d6',
                    700:'#2448ad', 800:'#193084', 900:'#0f1f5c' },
        },
        boxShadow: {
          card: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.05)',
        },
        borderRadius: {
          smd: '6px',
        },
        spacing: {
          4_5: '18px', /* lets you stay on an 18 / 36 / 72 rhythm if desired */
        },
        fontFamily: {
          sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        },
      },
    },
  }
  