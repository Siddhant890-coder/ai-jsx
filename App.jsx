import React, { useState } from "react";
import { FaGoogle, FaLinkedin, FaArrowRight } from "react-icons/fa";
import { BsLightningChargeFill, BsFileEarmarkText, BsDownload } from "react-icons/bs";
import { MdSecurity } from "react-icons/md";

const LandingPage = () => {
  const [isDark, setIsDark] = useState(false);

  const features = [
    {
      icon: <BsLightningChargeFill className="text-2xl" />,
      title: "Quick Creation",
      description: "Build your professional resume in minutes with our intuitive builder"
    },
    {
      icon: <BsFileEarmarkText className="text-2xl" />,
      title: "ATS-Friendly Templates",
      description: "Ensure your resume gets past applicant tracking systems"
    },
    {
      icon: <MdSecurity className="text-2xl" />,
      title: "Secure Platform",
      description: "Your data is protected with enterprise-grade security"
    },
    {
      icon: <BsDownload className="text-2xl" />,
      title: "Easy Export",
      description: "Download your resume in PDF format or share via link"
    }
  ];

  return (
    <div className={`min-h-screen ${isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <img
            src="https://images.unsplash.com/photo-1642132652075-2f0d2a9a0f88"
            alt="ResuWise Logo"
            className="h-8 w-8 rounded"
          />
          <span className="text-2xl font-bold">ResuWise</span>
        </div>
        <div className="hidden md:flex items-center space-x-6">
          <button className="hover:text-blue-600 transition-colors">Templates</button>
          <button className="hover:text-blue-600 transition-colors">Features</button>
          <button className="hover:text-blue-600 transition-colors">Pricing</button>
          <button
            onClick={() => setIsDark(!isDark)}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700"
          >
            {isDark ? "Light" : "Dark"} Mode
          </button>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Login
          </button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="md:w-1/2 space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold leading-tight">
              Create Professional Resumes in Minutes - <span className="text-blue-600">Totally Free!</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Build ATS-friendly resumes with our intuitive builder. Stand out from the crowd and land your dream job.
            </p>
            <div className="flex space-x-4">
              <button className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2">
                <span>Start Building Resume</span>
                <FaArrowRight />
              </button>
              <button className="px-8 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors">
                View Templates
              </button>
            </div>
            <div className="flex items-center space-x-4 pt-6">
              <button className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <FaGoogle className="text-red-500" />
                <span>Sign in with Google</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <FaLinkedin className="text-blue-500" />
                <span>Sign in with LinkedIn</span>
              </button>
            </div>
          </div>
          <div className="md:w-1/2 mt-12 md:mt-0">
            <img
              src="https://images.unsplash.com/photo-1586281380349-632531db7ed4"
              alt="Resume Builder Preview"
              className="rounded-lg shadow-2xl"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mt-24">
          {features.map((feature, index) => (
            <div key={index} className="p-6 rounded-lg bg-white dark:bg-gray-800 shadow-lg">
              <div className="text-blue-600 mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-600 dark:text-gray-300">{feature.description}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default LandingPage;

/*
To run this code in VS Code:

1. Create a new React project using:
npx create-react-app my-resume-app
cd my-resume-app

2. Install required dependencies using:
npm install react-icons
npm install -D tailwindcss@latest postcss@latest autoprefixer@latest

3. Initialize Tailwind CSS using:
npx tailwindcss init -p

4. Update tailwind.config.js with:
module.exports = {
  content: [
    "./src/App.jsx",
    "./src/index.js"
  ],
  theme: {
    extend: {}
  },
  plugins: []
};

5. Update ./src/index.css with:
@tailwind base;
@tailwind components;
@tailwind utilities;

6. Copy this code into src/App.jsx

7. Start development server:
npm start
*/
