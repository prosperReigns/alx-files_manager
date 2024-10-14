const { MongoClient } = require('mongodb');

class DBClient {
  constructor() {
    this.host = process.env.DB_HOST || 'localhost';
    this.port = process.env.DB_PORT || 27017;
    this.databaseName = process.env.DB_DATABASE || 'files_manager';

    this.uri = `mongodb://${this.host}:${this.port}`;
    this.client = new MongoClient(this.uri, { useNewUrlParser: true, useUnifiedTopology: true });

    this.connected = false;

    this.client.connect()
      .then(() => {
        this.connected = true;
        this.database = this.client.db(this.databaseName);
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err);
      });
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    if (!this.isAlive()) {
      return 0;
    }

    try {
      const usersCollection = this.database.collection('users');
      return await usersCollection.countDocuments();
    } catch (error) {
      console.error('Error counting users:', error);
      return 0;
    }
  }

  async nbFiles() {
    if (!this.isAlive()) {
      return 0;
    }

    try {
      const filesCollection = this.database.collection('files');
      return await filesCollection.countDocuments();
    } catch (error) {
      console.error('Error counting files:', error);
      return 0;
    }
  }
}

const dbClient = new DBClient();
module.exports = dbClient;
