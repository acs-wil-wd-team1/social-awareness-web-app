require('dotenv').config();

const base = {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
};

module.exports = {
    development: {
        ...base,
        database: process.env.DB_NAME,
    },
    test: {
        ...base,
        database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
    },
    production: {
        ...base,
        database: process.env.DB_NAME,
    },
};
