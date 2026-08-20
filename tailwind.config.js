export default {
  content: ['./src/templates/**/*.njk', './src/scripts/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f1fb',
          100: '#ebe3f6',
          200: '#d8c9ee',
          300: '#c2aee4',
          400: '#9f7ad1',
          500: '#7f5bb4',
          600: '#6b4895',
          700: '#593b7a',
          800: '#46315f',
          900: '#332546'
        },
        ink: '#1f2430',
        paper: '#fbfaf8',
        line: '#e8e3dc'
      },
      boxShadow: {
        soft: '0 10px 30px rgba(31, 36, 48, 0.06)'
      },
      fontFamily: {
        display: ['Georgia', 'Times New Roman', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
