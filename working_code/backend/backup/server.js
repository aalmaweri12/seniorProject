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
    idNumber: { type: String, unique: true },
    dob: String, // Date of Birth
    address: String, // Home Address
    city: String,
    state: String,
    postalCode: String,
    icdid: { type: String, unique: true },
    served: { type: Boolean, default: false },
    lastServed: { type: Date, default: null },
});

// Create a Mongoose Model
const User = mongoose.model('User', userSchema);

// API Endpoint to Check and Save/Update Data
app.post('/save-data', async (req, res) => {
    try {
        const { name, idNumber, dob, address, city, state, postalCode, icdid } = req.body;

        // Check if user exists by ID number
        const existingUser = await User.findOne({ idNumber });

        if (existingUser) {
            let updatedFields = {};

            // Compare each field and update only if different
            if (existingUser.name !== name) updatedFields.name = name;
            if (existingUser.dob !== dob) updatedFields.dob = dob;
            if (existingUser.address !== address) updatedFields.address = address;
            if (existingUser.city !== city) updatedFields.city = city;
            if (existingUser.state !== state) updatedFields.state = state;
            if (existingUser.postalCode !== postalCode) updatedFields.postalCode = postalCode;
            if (existingUser.icdid !== icdid) updatedFields.icdid = icdid; // Fixed typo

            // If there are differences, update only those fields
            if (Object.keys(updatedFields).length > 0) {
                await User.updateOne({ idNumber }, { $set: updatedFields });
                return res.status(200).json({ message: 'User data updated successfully!', updatedFields });
            } else {
                return res.status(409).json({ message: 'User already exists with the same data!' });
            }
        } else {
            // Create a new user if not found (Fixed missing `icdid`)
            const newUser = new User({ name, idNumber, dob, address, city, state, postalCode, icdid });
            await newUser.save();
            return res.status(201).json({ message: 'New user added successfully!' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while saving/updating data.' });
    }
});
//Create a new endpoint to fetch user data by ICDID and mark them as served
app.post('/find-by-icdid', async (req, res) => {
    try {
        const { icdid } = req.body;

        // Find the user by ICDID
        const user = await User.findOne({ icdid });

        if (!user) {
            return res.status(404).json({ message: 'User not found!' });
        }

        // Check if the user has been served in the last 48 hours
        const now = new Date();
        const lastServed = user.lastServed;
        const hoursSinceLastServed = lastServed ? (now - lastServed) / (1000 * 60 * 60) : null;

        if (hoursSinceLastServed && hoursSinceLastServed < 48) {
            return res.status(403).json({
                message: `User cannot be served again for ${Math.round(48 - hoursSinceLastServed)} more hours.`,
            });
        }

        // Mark the user as served and update the lastServed timestamp
        user.served = true;
        user.lastServed = now;
        await user.save();

        // Return the user's name and address
        res.status(200).json({
            name: user.name,
            address: user.address,
            message: 'User marked as served!',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while fetching user data.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
