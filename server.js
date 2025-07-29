const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const app = express();

// Middleware
app.use(express.json());
require('dotenv').config();
app.use(
  cors({
    origin: "*", // Allow all origins
  })
);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  family: 4
})
.then(() => {
  console.log("Connected to MongoDB");
})
.catch((error) => {
  console.log("Error connecting to MongoDB", error);
});

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Schemas
const ContactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  date: { type: Date, default: Date.now }
});

const BlogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  excerpt: String,
  author: { type: String, required: true },
  image: String,
  tags: [String],
  published: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  slug: { type: String, unique: true }
});

const JobPostingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  location: String,
  type: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Internship'], default: 'Full-time' },
  description: { type: String, required: true },
  requirements: [String],
  benefits: [String],
  salary: {
    min: Number,
    max: Number,
    currency: { type: String, default: 'USD' }
  },
  applicationDeadline: Date,
  applyUrl: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  date: { type: Date, default: Date.now }
});

// Add ChatMessage schema
const ChatMessageSchema = new mongoose.Schema({
  from: { type: String, enum: ['user', 'admin', 'bot'], required: true },
  text: { type: String, required: true },
  date: { type: Date, default: Date.now }
});
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);

// Models
const Contact = mongoose.model('Contact', ContactSchema);
const BlogPost = mongoose.model('BlogPost', BlogPostSchema);
const JobPosting = mongoose.model('JobPosting', JobPostingSchema);

// Product Schema
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  image: String,
  date: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Handle contact form submission.
 * 
 * @route POST /api/contact
 * @param {String} name - Sender's name
 * @param {String} email - Sender's email
 * @param {String} message - Message content
 * @returns {Object} JSON response
 */
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Save to MongoDB
    const newContact = new Contact({ name, email, message });
    await newContact.save();

    // Send email using Nodemailer
    await transporter.sendMail({
      from: email,
      to: process.env.REC_EMAIL,
      subject: 'New Contact Form Submission',
      text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
    });

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Get all blog posts
 * 
 * @route GET /api/blog
 * @returns {Array} Array of blog posts
 */
app.get('/api/blog', async (req, res) => {
  try {
    const posts = await BlogPost.find({ published: true }).sort({ date: -1 });
    res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Get a single blog post by slug
 * 
 * @route GET /api/blog/:slug
 * @param {String} slug - Blog post slug
 * @returns {Object} Blog post object
 */
app.get('/api/blog/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, published: true });
    if (!post) {
      return res.status(404).json({ message: 'Blog post not found' });
    }
    res.status(200).json(post);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Create a new blog post
 * 
 * @route POST /api/blog
 * @param {String} title - Blog post title
 * @param {String} content - Blog post content
 * @param {String} author - Author name
 * @param {String} excerpt - Blog post excerpt
 * @param {Array} tags - Blog post tags
 * @param {Boolean} published - Whether the post is published
 * @returns {Object} Created blog post
 */
app.post('/api/blog', upload.single('image'), async (req, res) => {
  try {
    const { title, content, author, excerpt, tags, published } = req.body;
    
    let imageUrl = '';
    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        );
        stream.end(req.file.buffer);
      });
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    const newPost = new BlogPost({
      title,
      content,
      author,
      excerpt,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      image: imageUrl,
      slug,
      published: published === true || published === 'true'
    });

    const savedPost = await newPost.save();
    res.status(201).json(savedPost);
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Get all job postings
 * 
 * @route GET /api/jobs
 * @returns {Array} Array of job postings
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await JobPosting.find({ isActive: true }).sort({ date: -1 });
    res.status(200).json(jobs);
  } catch (error) {
    console.error('Error fetching job postings:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Get a single job posting by ID
 * 
 * @route GET /api/jobs/:id
 * @param {String} id - Job posting ID
 * @returns {Object} Job posting object
 */
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await JobPosting.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job posting not found' });
    }
    res.status(200).json(job);
  } catch (error) {
    console.error('Error fetching job posting:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Create a new job posting
 * 
 * @route POST /api/jobs
 * @param {String} title - Job title
 * @param {String} company - Company name
 * @param {String} location - Job location
 * @param {String} type - Job type
 * @param {String} description - Job description
 * @param {Array} requirements - Job requirements
 * @param {Array} benefits - Job benefits
 * @param {Object} salary - Salary information
 * @param {Date} applicationDeadline - Application deadline
 * @returns {Object} Created job posting
 */
app.post('/api/jobs', async (req, res) => {
  try {
    const {
      title,
      company,
      location,
      type,
      description,
      requirements,
      benefits,
      salary,
      applicationDeadline,
      applyUrl
    } = req.body;

    const newJob = new JobPosting({
      title,
      company,
      location,
      type,
      description,
      requirements: Array.isArray(requirements)
        ? requirements
        : requirements
          ? requirements.split(',').map(req => req.trim())
          : [],
      benefits: Array.isArray(benefits)
        ? benefits
        : benefits
          ? benefits.split(',').map(benefit => benefit.trim())
          : [],
      salary,
      applicationDeadline,
      applyUrl
    });

    const savedJob = await newJob.save();
    res.status(201).json(savedJob);
  } catch (error) {
    console.error('Error creating job posting:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Get all chat messages
 * @route GET /api/chat
 * @returns {Array} Array of chat messages
 */
app.get('/api/chat', async (req, res) => {
  try {
    const messages = await ChatMessage.find().sort({ date: 1 });
    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Get all contacts (admin only)
 * @route GET /api/contact
 * @returns {Array} Array of contact submissions
 */
app.get('/api/contact', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ date: -1 });
    res.status(200).json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Delete a contact submission
 * @route DELETE /api/contact/:id
 * @param {String} id - Contact ID
 * @returns {Object} Success message
 */
app.delete('/api/contact/:id', async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Update a blog post
 * @route PUT /api/blog/:id
 * @param {String} id - Blog post ID
 * @param {String} title - Blog post title
 * @param {String} content - Blog post content
 * @param {String} author - Author name
 * @param {String} excerpt - Blog post excerpt
 * @param {Array} tags - Blog post tags
 * @param {Boolean} published - Whether the post is published
 * @returns {Object} Updated blog post
 */
app.put('/api/blog/:id', upload.single('image'), async (req, res) => {
  try {
    const { title, content, author, excerpt, tags, published } = req.body;
    
    let imageUrl = '';
    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        );
        stream.end(req.file.buffer);
      });
    }

    const updateData = {
      title,
      content,
      author,
      excerpt,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      published: published === true || published === 'true',
      ...(imageUrl && { image: imageUrl })
    };

    const updatedPost = await BlogPost.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.status(200).json(updatedPost);
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Delete a blog post
 * @route DELETE /api/blog/:id
 * @param {String} id - Blog post ID
 * @returns {Object} Success message
 */
app.delete('/api/blog/:id', async (req, res) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Update a job posting
 * @route PUT /api/jobs/:id
 * @param {String} id - Job posting ID
 * @returns {Object} Updated job posting
 */
app.put('/api/jobs/:id', async (req, res) => {
  try {
    const {
      title, company, location, type, description, requirements, benefits,
      salary, applicationDeadline, applyUrl, isActive
    } = req.body;

    const updateData = {
      title,
      company,
      location,
      type,
      description,
      requirements: requirements ? requirements.split(',').map(req => req.trim()) : [],
      benefits: benefits ? benefits.split(',').map(benefit => benefit.trim()) : [],
      salary,
      applicationDeadline,
      applyUrl,
      isActive: isActive === true || isActive === 'true'
    };

    const updatedJob = await JobPosting.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.status(200).json(updatedJob);
  } catch (error) {
    console.error('Error updating job posting:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Delete a job posting
 * @route DELETE /api/jobs/:id
 * @param {String} id - Job posting ID
 * @returns {Object} Success message
 */
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await JobPosting.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Job posting deleted successfully' });
  } catch (error) {
    console.error('Error deleting job posting:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

/**
 * Delete a chat message
 * @route DELETE /api/chat/:id
 * @param {String} id - Chat message ID
 * @returns {Object} Success message
 */
app.delete('/api/chat/:id', async (req, res) => {
  try {
    await ChatMessage.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Chat message deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});
/**
 * Send a chat message
 * @route POST /api/chat
 * @param {String} from - Sender ('user', 'admin', or 'bot')
 * @param {String} text - Message text
 * @returns {Object} Created chat message
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { from, text } = req.body;
    const newMsg = new ChatMessage({ from, text });
    const savedMsg = await newMsg.save();
    res.status(201).json(savedMsg);
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({ message: 'An error occurred' });
  }
});

// Get all blogs (admin)
app.get('/api/admin/blogs', async (req, res) => {
  try {
    const posts = await BlogPost.find().sort({ date: -1 });
    res.status(200).json(posts);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred' });
  }
});

// Get all jobs (admin)
app.get('/api/admin/jobs', async (req, res) => {
  try {
    const jobs = await JobPosting.find().sort({ date: -1 });
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred' });
  }
});

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ date: -1 });
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred' });
  }
});

// Create a new product
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, category, description } = req.body;
    let imageUrl = '';
    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        );
        stream.end(req.file.buffer);
      });
    }
    const newProduct = new Product({ name, category, description, image: imageUrl });
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred' });
  }
});

// Update a product
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, category, description } = req.body;
    let imageUrl = '';
    if (req.file) {
      imageUrl = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          }
        );
        stream.end(req.file.buffer);
      });
    }
    const updateData = {
      name,
      category,
      description,
      ...(imageUrl && { image: imageUrl })
    };
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    res.status(200).json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: 'An error occurred' });
  }
});

// Delete a product
app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'An error occurred' });
  }
});

// Health check endpoint for wake-up service
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Wake-up server mechanism to prevent Render free tier downtime
const wakeUpServer = () => {
  const serverUrl = process.env.SERVER_URL 
  
  fetch(`${serverUrl}/api/health`)
    .then(response => {
      if (response.ok) {
        console.log(`✅ Server wake-up successful at ${new Date().toISOString()}`);
      } else {
        console.log(`⚠️ Server wake-up failed with status: ${response.status}`);
      }
    })
    .catch(error => {
      console.log(`❌ Server wake-up error: ${error.message}`);
    });
};

// Set up wake-up interval (every 20 minutes = 1,200,000 milliseconds)
const WAKE_UP_INTERVAL = 20 * 60 * 1000; // 20 minutes in milliseconds

// Start wake-up service after server is running
setTimeout(() => {
  console.log('🚀 Starting wake-up service to keep server alive...');
  
  // Initial wake-up call
  wakeUpServer();
  
  // Set up recurring wake-up calls
  setInterval(wakeUpServer, WAKE_UP_INTERVAL);
  
  console.log(`⏰ Wake-up service configured to run every ${WAKE_UP_INTERVAL / 60000} minutes`);
}, 5000); // Wait 5 seconds after server starts

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));