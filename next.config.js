/** @type {import('next').NextConfig} */
const nextConfig = {}
require('dotenv').config();



module.exports = {
  env: {
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    REFRESH_TOKEN: process.env.REFRESH_TOKEN,
  },
};



module.exports = nextConfig
