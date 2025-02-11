const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const xlsx = require('xlsx'); // For exporting data to Excel

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
    isBlocked: { type: Boolean, default: false }, // New field to block/unblock users
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
            if (existingUser.icdid !== icdid) updatedFields.icdid = icdid;

            // If there are differences, update only those fields
            if (Object.keys(updatedFields).length > 0) {
                await User.updateOne({ idNumber }, { $set: updatedFields });
                return res.status(200).json({ message: 'User data updated successfully!', updatedFields });
            } else {
                return res.status(409).json({ message: 'User already exists with the same data!' });
            }
        } else {
            // Create a new user if not found
            const newUser = new User({ name, idNumber, dob, address, city, state, postalCode, icdid });
            await newUser.save();
            return res.status(201).json({ message: 'New user added successfully!' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while saving/updating data.' });
    }
});

// Endpoint to fetch user data by ICDID and mark them as served
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

// New Endpoint: Search for users by name, ID number, or ICDID
app.get('/search-users', async (req, res) => {
    try {
        const { query } = req.query;

        // Search for users by name, ID number, or ICDID
        const users = await User.find({
            $or: [
                { name: { $regex: query, $options: 'i' } }, // Case-insensitive search
                { idNumber: query },
                { icdid: query },
            ],
        });

        res.status(200).json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while searching for users.' });
    }
});

// New Endpoint: Edit user data by ID
app.put('/edit-user/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;

        // Update the user data
        const updatedUser = await User.findByIdAndUpdate(id, updatedData, { new: true });

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found!' });
        }

        res.status(200).json({ message: 'User updated successfully!', user: updatedUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while updating user data.' });
    }
});

// New Endpoint: Block or unblock a user by ID
app.put('/block-user/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { isBlocked } = req.body;

        // Update the user's blocked status
        const updatedUser = await User.findByIdAndUpdate(id, { isBlocked }, { new: true });

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found!' });
        }

        res.status(200).json({ message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully!`, user: updatedUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while updating user status.' });
    }
});

// New Endpoint: Export all user data to an Excel file
app.get('/export-to-excel', async (req, res) => {
    try {
        // Fetch all users
        const users = await User.find({}, '-__v -$isNew -_doc -$__'); // Exclude unnecessary fields

        // Convert to Excel format
        const cleanedUsers = users.map(user => ({
            Name: user.name,
            ID_Number: user.idNumber,
            DOB: user.dob,
            Address: user.address,
            City: user.city,
            State: user.state,
            Postal_Code: user.postalCode,
            ICDID: user.icdid,
            Served: user.served ? "Yes" : "No",
            Last_Served: user.lastServed ? user.lastServed.toISOString().split('T')[0] : "Never",
            Blocked: user.isBlocked ? "Yes" : "No"
        }));

        const worksheet = xlsx.utils.json_to_sheet(cleanedUsers);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Users');

        const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx');
        res.send(excelBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred while exporting data.' });
    }
});



// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});