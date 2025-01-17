const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const nodemailer = require('nodemailer');
require('dotenv').config(); // load environment variables from .env file

const app = express();

// middleware
app.use(bodyParser.json());
app.use(express.static('public')); // serve files from the 'public' directory

// mySQL Connection
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_ADDRESS, 
        pass: process.env.EMAIL_PASSWORD 
    }
});

// feedback submission route
app.post('/submit-feedback', (req, res) => {
    const { product_name, user_name, email, rating, comments } = req.body;

    const query = 'INSERT INTO user_feedback (product_name, user_name, email, rating, comments, approved) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(query, [product_name, user_name, email, rating, comments, 'pending'], (err, result) => {
        if (err) {
            console.error('Error submitting feedback:', err);
            res.status(500).json({ success: false, message: 'Error submitting feedback' });
            return;
        }

        // send email notification to user
        const mailOptions = {
            from: process.env.EMAIL_ADDRESS,
            to: email,
            subject: 'Feedback Submission Confirmation',
            text: 'Thank you for your feedback! Your submission is currently pending approval.'
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });

        res.json({ success: true, message: 'Feedback submitted successfully and is pending approval.' });
    });
});

// admin route....gets all feedback
app.get('/admin/feedback', (req, res) => {
    const query = 'SELECT * FROM user_feedback';
    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching feedback:', err);
            return res.status(500).json({ success: false, message: 'Error fetching feedback' });
        }
        res.json({ success: true, feedback: results });
    });
});

// admin routes...approve feedback
app.put('/admin/feedback/:id/approve', (req, res) => {
    const feedbackId = req.params.id;

    // gets email of user whose feedback is getting approved
    const getEmailQuery = 'SELECT email, approved FROM user_feedback WHERE id = ?';
    connection.query(getEmailQuery, [feedbackId], (err, results) => {
        if (err) {
            console.error('Error fetching email:', err);
            return res.status(500).json({ success: false, message: 'Error fetching email' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Feedback not found' });
        }

        const userEmail = results[0]?.email;
        const feedbackStatus = results[0]?.approved;

        // check if feedback is already approved or rejected
        if (feedbackStatus === 'approved') {
            return res.status(400).json({ success: false, message: 'Cannot approve feedback that is already approved' });
        }

        if (feedbackStatus === 'rejected') {
            return res.status(400).json({ success: false, message: 'Cannot approve feedback that has been rejected' });
        }

        // proceed to approve feedback
        const updateQuery = 'UPDATE user_feedback SET approved = ? WHERE id = ?';
        connection.query(updateQuery, ['approved', feedbackId], (err, result) => {
            if (err) {
                console.error('Error approving feedback:', err);
                return res.status(500).json({ success: false, message: 'Error approving feedback' });
            }

            // send email notification to user
            if (userEmail) {
                const mailOptions = {
                    from: process.env.EMAIL_ADDRESS,
                    to: userEmail,
                    subject: 'Feedback Approved',
                    text: 'Your feedback has been approved! Thank you for your contribution.'
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error sending email:', error);
                    } else {
                        console.log('Email sent: ' + info.response);
                    }
                });
            }

            res.json({ success: true, message: 'Feedback approved successfully' });
        });
    });
});


// admin route to reject feedback
app.put('/admin/feedback/:id/reject', (req, res) => {
    const feedbackId = req.params.id;

    // get current approval status of the feedback
    const getStatusQuery = 'SELECT approved, email, product_name, user_name, rating, comments FROM user_feedback WHERE id = ?';
    connection.query(getStatusQuery, [feedbackId], (err, results) => {
        if (err) {
            console.error('Error fetching feedback status:', err);
            return res.status(500).json({ success: false, message: 'Error fetching feedback status' });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Feedback not found' });
        }

        const { approved, email: userEmail, product_name, user_name, rating, comments } = results[0];

        // check if feedback is already approved
        if (approved === 'approved') {
            return res.status(400).json({ success: false, message: 'Cannot reject feedback that is already approved' });
        }

        // insert rejected feedback directly without checking for duplicates
        const insertQuery = 'INSERT INTO rejected_feedback (product_name, user_name, email, rating, comments) VALUES (?, ?, ?, ?, ?)';
        connection.query(insertQuery, [product_name, user_name, userEmail, rating, comments], (err, result) => {
            if (err) {
                console.error('Error inserting rejected feedback:', err);
                return res.status(500).json({ success: false, message: 'Error rejecting feedback' });
            }

            // now delete the original feedback entry
            const deleteQuery = 'DELETE FROM user_feedback WHERE id = ?';
            connection.query(deleteQuery, [feedbackId], (err, result) => {
                if (err) {
                    console.error('Error deleting feedback:', err);
                    return res.status(500).json({ success: false, message: 'Error deleting feedback' });
                }

                // send email notification to user
                if (userEmail) {
                    const mailOptions = {
                        from: process.env.EMAIL_ADDRESS,
                        to: userEmail,
                        subject: 'Feedback Rejected',
                        text: 'Your feedback has been rejected. Please contact us for more information.'
                    };

                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) {
                            console.error('Error sending email:', error);
                        } else {
                            console.log('Email sent: ' + info.response);
                        }
                    });
                }

                res.json({ success: true, message: 'Feedback rejected successfully and deleted from user feedback.' });
            });
        });
    });
});





// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port https:${PORT}`);
});
