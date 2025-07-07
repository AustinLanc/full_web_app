# Lab Web Application with Chat

This is a lightweight web application designed to help lab personnel and departments manage sample inventory, track test results, and communicate efficiently through an integrated chat feature. A Telegram bot is also included to send reminder notifications when sample checks are due.

---

## Getting Started

Before running the application, a few setup steps are required. Please follow the instructions below:

### 🔧 Files to Update

1. **`sample.env`**  
  - Rename to `.env`  
  - Update with your actual database host, username, password, and database names

2. **`example-config.js`**  
  - Rename to `config.js`  
  - Add your Telegram bot token and chat ID  
  - If you don’t plan to use the Telegram bot feature, delete this file and remove related logic from `index.js` and `layout.ejs`

3. **`blank-tasks.json`**  
  - If using the Telegram bot, rename to `tasks.json`

4. **`static/icon.ico` and `static/logo.png`**  
  - Replace these with your organization's icons and logos

---

### 📂 Database Setup

- This app uses **MySQL** and requires three separate databases  
- Schema dumps are located in the `/dumps` directory  
- If you prefer a different database structure, you will need to update:
  - `knexfile.js`
  - `index.js`
  - `.env`

---

### 🔐 Default Admin Account

- A default administrator account is created with the following credentials:
  - Username: Admin  
  - Password: 12345678

- After logging in, it’s strongly recommended to change the password and add more secure user accounts.

---

### 📝 Notes

- This application is meant as a **template** and will likely need customization to fit your specific workflow and requirements.
- Feel free to modify and expand it as necessary for your team’s use.
