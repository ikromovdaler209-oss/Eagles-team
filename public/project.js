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
let senddd = document.getElementById("btn10")
if (senddd) {
    senddd.addEventListener("click", Press);
}
(function () {
    var box = document.getElementById('box10');
    var btn = document.getElementById('btn10');
    if (btn && box) {
        btn.addEventListener('click', function () {
            box.classList.remove('spin');
            void box.offsetWidth; // сброс, чтобы анимация перезапускалась каждый раз
            box.classList.add('spin');
        });
    }
})();
let radio1 = document.getElementById("radio1")
let radio2 = document.getElementById("radio2")
let radio3 = document.getElementById("radio3")
let questions1 = ["What do you usually do in your free time?", "Do you like taking photos?", "What kind of music do you usually listen to?", "Do you often use public transportation?", "What is your favorite time of the day?", "Do you enjoy cooking?",
            "How often do you watch movies?", "Do you prefer studying in the morning or evening?", "What kind of weather do you like?", "Do you like visiting new places?",
            "How often do you use your phone?", "Do you enjoy reading books?", "What is your favorite season?",
            "Do you like shopping?", "How often do you meet your friends?", "Do you prefer living in a big city or a small town?", 
            "What do you usually have for breakfast?", "Do you like learning new languages?", "What kind of clothes do you usually wear?",
            "Do you prefer spending time alone or with other people?", "Do you like spending time outdoors?", "How often do you use social media?", 
            "Do you enjoy going for walks?", "What is your favorite food?", "Do you usually eat at home or in restaurants?",
            "Do you like your hometown?", "How often do you travel?", "Do you prefer hot or cold drinks?", "What do you usually do at weekends?",
            "Do you like animals?", "Do you have a favorite sport?", "How often do you exercise?", "Do you enjoy going to the cinema?", 
            "What kind of TV programs do you like?", "Do you like wearing watches?", "How often do you buy new clothes?",
            "Do you prefer tea or coffee?", "Is there a place you would like to visit?", "Do you enjoy studying English?",
            "What do you usually do when you feel bored?", "Do you work or are you a student?", "What work do you do? / What subjects are you studying?", "Why did you choose that job?", 
            "Why did you choose to study that subject?", "Do you like your job?", "Is there anything you dislike about your job?", 
            "What do you like about your studies?", "What do you dislike about your studies?", "What was your dream job when you were young?",
            "Have you changed your mind on your dream job?"]
let questions2 = ["Describe your favorite season of the year.", "Describe a public place that you think needs improvements.", "Describe a city or country you want to live the most in the future.",
            "Describe something you learned in a place/from a person.", "Describe an occasion where you received a good service from a company or shop.",
            "Describe a toy that you received when you were a child", "Describe a famous person that you are interested in",
            "Describe an interesting event in your school.", "Describe an interesting event in your school.", "Describe a situation where you have to be polite",
            "Describe a visitor in your home.", "Describe a place in your city you want to go to.", "Describe an important river/lake in your country.",
            "Describe a person you know.", "Describe an impressive story you heard from other people.", "Describe a recent development in your city.",
            "Describe an unforgettable dinner", "Describe a historical era you are interested in.", "Describe a special day out (A day out which does not cost too much).",
            "Describe a sports person you admire", "Describe an experience where you were late for an event.", "Describe a piece of technology you like using except computers", 
            "Describe something special that you saved money to buy.", "Describe a holiday you would like to take in the future.", "Describe someone who is a good parent.",
            "Describe a rule at your school that you agree or disagree with.", "Describe a rule at your school that you agree or disagree with.", "Describe an achievement that you are proud of.",
            "Describe a car journey you went on.", "Describe something you bought recently that made you happy.", "Describe a dream house or apartment you want to live in.", 
            "Describe an activity you do to keep fit.", "Describe a difficult decision that you once made.", "Describe a garden/park you have visited.", 
            "Describe an occasion when you helped a person", "Describe a traditional product in your country", "Describe a piece of furniture you like. (in your home)",
            "Describe an important letter you received", "Describe an exciting book you have read.", "Describe something you enjoy doing with an old person in your family.", 
            "Describe a situation when you had to be polite.", "Describe a time when someone visited your home.", "Describe an unusual dinner that you had.", 
            "Describe an important event that you celebrated.", "Describe an important skill which cannot be learned at school", "Describe a new friend you've made recently.", "Describe a polite person you met.", 
            "Describe a family member who has had an important influence on you", "Describe an invention that changed people's lives.", "Describe your favourite piece of clothing.", "Describe a city or town you have been to.", 
            "Describe a place you visited.", "Describe a café you like or dislike", "Describe a lesson that you enjoyed.", "Describe a leisure activity near or on the sea.", "Describe a TV program you enjoy.", 
            "Describe a service from a company or shop.", "Describe an interesting conversation you had with someone", "Describe a change in your life.", "Describe a time when you worked in a team.", "Describe a piece of good news you heard.", 
            "Describe a trip you took by bike.", "Describe a decision that you disagreed with.", "Describe an enjoyable experience you had in the countryside", "Describe a type of weather you like.", "Describe an interesting talk or speech you heard.",
            "Describe an experience when you spent time with a child", "Describe a piece of artwork that you have seen before", "Describe a useful website that you often visit.", "Describe one of your best friends.", 
            "Describe a street you know well.", "Describe a time when you saw an interesting animal", "Describe a famous person that you are interested in.", "Describe an interesting neighbour you know.", "Describe a family member that made you proud.",
            "Describe two people from the same family.", "Describe an important plant in your country.", "Describe a foreign food you would like to try.", "Describe a crowded place.", "Describe a popular place.", 
            "Describe a newly-opened shop.", "Describe a place where you want to work.", "Describe a time that you arrived early.", "Describe an interesting event.", "Describe a special trip in the near future", 
            "Describe a kind of music or a song.", "Describe a time when you were not allowed to use your sell phone.", "Describe a TV series you enjoy watching.", "Describe an interesting advertisement.", 
            "Describe someone you admire who is much older than you.", "Describe a person who has apologized to you.", "Describe a dinner you enjoyed with your friends.", "Describe a time when you had to work hard to achieve a goal.", 
            "Describe a holiday or vacation you have been on.", "Describe a happy family event that you remember well.", "Describe a long journey you travelled by car.", "Describe a short trip that was special to you.", 
            "Describe an environment law.", "Describe a recent happy event.", "Describe a long walk you had.", "Describe a situation when someone made noise.", "Describe a difficult choice that you made.", 
            "Describe what you would do if you were given a day off.", "Describe an ideal house.", "Describe a book you liked to read in your childhood.", "Describe a success in your life.", "Describe a time when you were looking at the sky.",
            "Describe an article you read about healthy life.", "Describe a new skill you would like to learn.", "Describe one activity stopped by the weather.", "Describe a person who gave a clever solution to a problem.", "Describe a time when you had a problem with a piece of epuipment.",
            "Describe an outdoor meal or picnic that you had.", "Describe an important stage of your life.", "Describe a project or a piece of work you did together with someone.", "Describe an occasion that someone or something made noise.", 
            "Describe something you do to keep healthy.", "Describe what you would do if you had a day off.", "Talk about something that makes you excited.", "Describe an experience that you had when you left home", 
            "Describe a positive change that you made to your life.", "Describe a person you know who is beautiful or handsome.", "Describe an old friend you enjoy talking with.", "Describe a place where people go to listen to music.", "Describe a shop that has opened in your hometown.", 
            "Describe a movie you would like to watch again.", "Describe a special cake you had.", "Describe a subject you would like to study that you never had the opportunity to study.", "Describe a situation where you have to be polite.", 
            "Describe a memorable story told by someone.", "Describe an art and craft activity you did at school.", "Describe a visitor in your home.", "Describe a historical period that you are interested in.", 
            "Describe an unusual meal you had.", "Describe your favorite season of the year.", "Describe something you learned in a place or from someone.", "Describe an interesting song you like", 
            "Describe a recent change in your life.", "Describe a person who has apologized to you.", "Describe a leader or politician who you admire.", "Describe a person who does well in work.", "Describe an adventurous person who you know.", 
            "Describe a famous athlete you know.", "Describe something you enjoy doing with an old person in your family.", "Describe an interesting person from another country.", "Describe a time when someone helped you.", 
            "Describe a shopping street you would like to go.", "Describe a city or country you most want to live in the future.", "Describe a tall building in your hometown you like or dislike."]
let questions3 = ["Why do you think people spend so much time on social media nowadays?", "How has technology changed the way people communicate?", 
            "Do you think young people have enough free time these days?", "What are the main advantages and disadvantages of living in a big city?", "Why do some people prefer living in the countryside?",
            "How can schools encourage students to be more interested in learning?", "Do you think university education is necessary for everyone?", "How has the internet changed the way people learn new skills?",
            "Why do people choose to travel to foreign countries?", "Do you think tourism has more positive or negative effects on local communities?",
            "How have people’s eating habits changed in recent years?", "Why are some people less physically active than previous generations?",
            "What can governments do to encourage people to live healthier lifestyles?", "Do you think people today are more stressed than they were in the past?",
            "Why do people sometimes find it difficult to maintain friendships?", "How important is money when choosing a career?", 
            "Should companies allow employees to work from home more often?", "Why do some people prefer buying things online rather than in physical stores?", 
            "How do advertisements influence people’s choices?", "Do you think people’s attitudes toward the environment are changing? Why?",
            "To what extent has modern technology changed the way people form and maintain relationships?", "Should private cars be restricted in large cities even if this makes transportation less convenient for some people?",
            "Do you think the increasing use of artificial intelligence will create more opportunities than problems for future generations?", "Why do some traditional customs disappear over time, while others remain popular for generations?",
            "Should universities focus more on practical skills than theoretical knowledge? Why or why not?", "Do you think social media has changed people’s understanding of what it means to be successful?", 
            "To what extent should schools be responsible for teaching children about environmental problems?", "Why do people sometimes continue buying things they do not really need?",
            "Do you think economic development should be prioritised over environmental protection in developing countries?", "How might the way people work change over the next twenty years?", 
            "Should governments invest more money in public transportation even if taxes have to be increased?", "Why do you think some people are more willing than others to accept changes in society?",
            "Do you think having access to more information necessarily makes people better informed?", "How has globalisation affected traditional cultures, and do you think these effects will become stronger in the future?", 
            "Should historical buildings always be preserved, even when replacing them with modern buildings would be more economically beneficial?", "Why are some people attracted to lifestyles that are very different from those of previous generations?",
            "Do you think governments can effectively reduce inequality, or will there always be significant differences between social groups?", "How might people’s attitudes towards education change as technology becomes more advanced?",
            "Some people believe that travelling has become less meaningful because modern tourists can easily access information about almost any destination. To what extent do you agree?"]
        let used1 = []; let used2 = []; let used3 = [];
function Press() {
if (radio1.checked) {

    if (used1.length === questions1.length) {
        used1 = [];
    }

    let random1;

    do {
        random1 = Math.floor(Math.random() * questions1.length);
    } while (used1.includes(random1));

    used1.push(random1);

    document.getElementById("box10").innerText = questions1[random1];
}

else if (radio2.checked) {

    if (used2.length === questions2.length) {
        used2 = [];
    }

    let random2;

    do {
        random2 = Math.floor(Math.random() * questions2.length);
    } while (used2.includes(random2));

    used2.push(random2);

    document.getElementById("box10").innerText = questions2[random2];
}

else if (radio3.checked) {

    if (used3.length === questions3.length) {
        used3 = [];
    }

    let random3;

    do {
        random3 = Math.floor(Math.random() * questions3.length);
    } while (used3.includes(random3));

    used3.push(random3);

    document.getElementById("box10").innerText = questions3[random3];
}
}