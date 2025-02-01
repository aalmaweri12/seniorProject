const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors()); // Enable CORS for frontend-backend communication
app.use(bodyParser.json()); // Parse JSON request bodies

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/dataExtractorDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Define a Mongoose Schema
const userSchema = new mongoose.Schema({
    name: String,
    idNumber: String,
    dob: String, // Date of Birth
    address: String, // Home Address
    city: String,
    state: String,
    postalCode: String,
});

// Create a Mongoose Model
const User = mongoose.model('User', userSchema);

// API Endpoint to Save Data
app.post('/save-data', async (req, res) => {
    try {
        const { name, idNumber, dob, address, city, state, postalCode } = req.body;

        // Create a new user document
        const newUser = new User({
            name,
            idNumber,
            dob,
            address,
            city,
            state,
            postalCode,
        });

        // Save the document to MongoDB
        await newUser.save();

        res.status(201).json({ message: 'Data saved successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while saving data.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});