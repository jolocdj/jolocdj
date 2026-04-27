const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "achievo",
  password: "Jolo@070201",
  port: 5432,
});

module.exports = pool;
