let images = document.querySelectorAll(".teachers-grid .teacher-photo");
let a = images.length;
for (let i = 0; i < a; i++) {
    images[i].style.backgroundImage = `url(images/${i + 1}.JPG)`;
    images[i].style.backgroundSize = "cover";
    images[i].style.backgroundPosition = "center";
}
// ERROR MESSAGES
const errorMessages = {
    "All fields are required":
        "Please fill in all required fields.",
    "Invalid input length":
        "Some of the entered information is too long.",
    "Invalid phone number":
        "Please enter a valid Uzbekistan phone number.",
    "Invalid age":
        "Please enter a valid age.",
    "Invalid course":
        "Please select a valid course.",
    "Invalid request":
        "The request could not be processed.",
    "This request was already submitted recently":
        "This application has already been submitted.",
    "Too many requests. Please try again later.":
        "Too many attempts. Please try again later.",
    "Failed to send message":
        "We couldn't send your application. Please try again later.",
    "Server error":
        "A server error occurred. Please try again later.",
    "Internal server error":
        "Something went wrong. Please try again later.",
    "Request is too large":
        "The submitted information is too large.",
    "Content-Type must be application/json":
        "Invalid request format."
};
// SEND INFORMATION
async function SendInfo() {
    const name = document.getElementById("firstName").value.trim();
    const lastname = document.getElementById("lastName").value.trim();
    const age = document.getElementById("age").value.trim();
    const subject = document.getElementById("subject").value.trim();
    const number = document.getElementById("phone").value.trim();
    const status = document.getElementById("status");
    const form = document.getElementById("registerForm");
    // EMPTY FIELDS
    if (!name || !lastname || !age || !subject || !number) {
        status.style.color = "black";
        status.style.textShadow = "0px 0px 20px red";
        status.innerHTML =
            "✖️ Please fill in all required fields.";
        return;
    }
    // PHONE VALIDATION
    const phoneRegex = /^\+998(?:20|33|50|77|80|87|88|90|91|92|93|94|95|97|98|99)\d{7}$/;
    if (!phoneRegex.test(number)) {
        status.style.color = "black";
        status.style.textShadow = "0px 0px 20px red";
        status.innerHTML =
            "✖️ Please enter a valid Uzbekistan phone number.";
        return;
    }
    // COURSE VALIDATION
    const allowedCourses = [
        "IELTS",
        "CEFR",
        "pre IELTS",
        "Grammar"
    ];
    const selectedCourse = subject.toLowerCase();
    const validCourse = allowedCourses.some(
        course => course.toLowerCase() === selectedCourse
    );
    if (!validCourse) {
        status.style.color = "black";
        status.style.textShadow = "0px 0px 20px red";
        status.innerHTML =
            "✖️ Please select a valid course.";
        return;
    }
    // SEND REQUEST
    try {
        const response = await fetch("/send-message", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                lastname,
                age,
                subject,
                number
            })
        });
        const data = await response.json();
        console.log(data);
        // SUCCESS
        if (data.ok) {
            status.style.color = "red";
            status.style.textShadow = "0px 0px 20px black";
            status.innerHTML =
                "☑️ Your information has been successfully sent.";
            form.reset();
            return;
        }
        // SERVER ERROR
        const message =
            errorMessages[data.error] ||
            "Something went wrong. Please try again.";
        status.style.color = "black";
        status.style.textShadow = "0px 0px 20px red";
        status.innerHTML =
            `✖️ ${message}`;
    } catch (error) {
        console.error(error);
        status.style.color = "red";
        status.style.textShadow = "0px 0px 20px red";
        status.innerHTML =
            "✖️ Connection error. Please check your internet connection and try again.";
    }
}
// SEND BUTTON
const sendButton = document.getElementById("sendButton");
if (sendButton) {
    sendButton.addEventListener("click", SendInfo);
}
// MOBILE MENU
const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");
if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", function () {
        mainNav.classList.toggle("active");
        if (mainNav.classList.contains("active")) {
            menuToggle.textContent = "✕";
            menuToggle.setAttribute(
                "aria-label",
                "Close menu"
            );
        } else {
            menuToggle.textContent = "☰";
            menuToggle.setAttribute(
                "aria-label",
                "Open menu"
            );
        }
    });
}
function Press() {
           let questions = ["What do you usually do in your free time?", "Do you like taking photos?", "What kind of music do you usually listen to?", "Do you often use public transportation?", "What is your favorite time of the day?", "Do you enjoy cooking?",
            "How often do you watch movies?", "Do you prefer studying in the morning or evening?", "What kind of weather do you like?", "Do you like visiting new places?",
            "How often do you use your phone?", "Do you enjoy reading books?", "What is your favorite season?",
            "Do you like shopping?", "How often do you meet your friends?", "Do you prefer living in a big city or a small town?", 
            "What do you usually have for breakfast?", "Do you like learning new languages?", "What kind of clothes do you usually wear?",
            "Do you prefer spending time alone or with other people?"]
            let random = Math.floor(Math.random() * questions.length);
            document.getElementById("box10").innerText = questions[random];
        }