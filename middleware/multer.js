const multer = require('multer');
const path = require('path');
const fs = require('fs');
// Optional: Remove gm if not needed for basic uploads
// const gm = require('gm');

// Configure storage for different upload types
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'public/uploads/';
    
    // Different folders for different file types
    if (file.fieldname === 'profile_picture') {
      uploadPath += 'profile/';
    } else if (file.fieldname === 'menu_image') {
      uploadPath += 'menu/';
    } else {
      uploadPath += 'general/';
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'image/jpeg': true,
    'image/jpg': true,
    'image/png': true,
    'image/gif': true,
    'image/webp': true
  };
  
  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
  }
};

// Create upload instances for different use cases
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 1 // Single file upload
  },
  fileFilter: fileFilter
});

// For multiple file uploads (like menu items with multiple images)
const uploadMultiple = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5 // Max 5 files
  },
  fileFilter: fileFilter
});

// Optional: Image compression function (if you want to keep it)
const compressImage = async (filePath) => {
  // If you have GraphicsMagick installed, you can use it
  // Otherwise, you might want to use a different library like sharp
  return filePath; // For now, return the original path
};

module.exports = {
  upload,
  uploadMultiple,
  compressImage,
  // Export specific middleware for common use cases
  profileUpload: upload.single('profile_picture'),
  menuImageUpload: upload.single('menu_image'),
  multipleMenuImages: uploadMultiple.array('menu_images', 5)
};