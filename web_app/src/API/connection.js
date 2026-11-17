const sql = require("mysql2");

const config = {
    user: "root",
    password: "12345678",
    host: "localhost",
    database: "DatSanCauLong",
    // options: {
    //     encrypt: false,
    //     trustServerCertificate: true
    // }
};

const conn = sql.connect(config);

module.exports = {
    conn: conn,
    sql: sql
};