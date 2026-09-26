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
            void box.offsetWidth;
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
            "Have you changed your mind on your dream job?", "Please describe your hometown a little.", "What is your town well-known for?", "Do you like your hometown?", 
            "Is that a big city or a small place?", "How long have you been living there?", "Do you think you will continue living there for a long time?", "Would you like to live in the countryside in the future?", 
            "Have you ever lived in the countryside?", "Do you ever spend time in the countryside?", "What is the difference between living in the countryside and the city?", 
            "What do people living in the countryside like to do?", "What do you like to do in the countryside?", "How has your town changed over the last 20 years?", "What colour would you choose to paint the walls of your room?", 
            "What colour would you never use in your home?", "Can you describe the place where you live?", "What kind of housing accommodation do you live in?", "What do you like about your flat?", 
            "Which room does your family spend most of the time in?", "What can you see from the windows where you live?", "Do you prefer living in a house or a flat?", "What would you like to change in your flat?", 
            "What do you dislike about your flat?", "Would you like to be a teacher?", "Do you think you could be a teacher?", "Did (Do) you have a favourite teacher?", "How does this teacher help you?", 
            "How has your favourite teacher helped you?", "Do you think you spend too much time on social media?", "What do people often do on social media?", "What was your dream when you were a child?", 
            "Are you the kind of person who sticks to dreams?", "Do you think you are an ambitious person?", "Are you an ambitious person?", "What is your dream job?", 
            "Would you use mirrors to decorate your room?", "Do you usually take a mirror with you?", "How often do you use a mirror?", "Have you ever bought a mirror?", "Do you use a mirror before buying clothing?", 
            "What functions does a mirror have?", "Do you think a mirror is a good decoration?", "Do you prefer sad or happy music?", "Does happy music make you feel more excited?", "How do you keep things tidy?", 
            "Would you say you are a tidy person?", "Do you like to keep things tidy?", "Do you think it is possible for people to be tidy all the time?", "Did you use to keep your room tidy as a child?", 
            "What kinds of websites do you often visit?", "What kinds of websites are popular in your country?", "What is your favourite website?", "Are there any changes to the websites you often visit?", 
            "Do you like to wear watches?", "Do you think a watch is important for you?", "Have you ever received a watch as a gift?", "Why do people like expensive watches?", "Do you like shopping?",
            "How often do you go shopping?", "Do you compare prices when you shop?", "Is it difficult for you to make choices when you shop?", "What type of car do you like?", "What colour car would you choose to buy?",
            "Do you think car colours are important?", "What do you usually do when there's a traffic jam?", "Do you prefer to be a driver or a passenger?", "Do you like to go to parks?", 
            "When was the last time you went to the park?", "Do people in your country often go to parks?", "Do you like science?", "Did you like science classes when you were young?", "Do you want to travel in the outer space?",
            "What would you do if you had an opportunity?", "Do you think it's necessary to see other planets?", "Are you interested in films about outer space and stars?", "Do you like science fiction movies?", 
            "Have you ever taken a course about stars?", "Is it important to study stars?", "Do you want to know more about outer space?", "Do you use headphones?", "In what situations would you use headphones?", "What type of headphones do you use?", 
            "In what situations would you NOT use headphones?", "Do you think singing can bring happiness to people?", "Do you like modern art or traditional art?", "Do you like art?", "Have you ever visited an art gallery?", 
            "Do you think it would be interesting for you to be an artist?", "Do you usually wear T-shirts?", "Do you like wearing T-shirts?", "Do you like T-shirts with pictures and prints?", "What colour clothes do you like to wear?",
            "What are the differences between men and women's preference in colour?", "What kind of clothes do you like to wear?", "What kind of clothes do you never wear?", "Do you wear the same style of clothes on weekdays and weekends?", 
            "Are you good at telling jokes?", "Do your friends like to tell jokes?", "Do you like to watch comedies?", "What is your morning routine?", "Do you spend your mornings doing the same things on both weekends and weekdays?", 
            "Is breakfast important?", "Do you like to get up early?", "Do you like the morning or the evening?", "What do you usually do in the evening?", "Do you think history is important?", "Do you like to learn about history?",
            "Do you think the internet is a good place to learn about history?", "Do you prefer living in an old building or a modern house?", "Should old buildings be preserved?", "Are there any old buildings you want to see in the future?", 
            "What aspect of culture do old buildings reflect?", "How do old buildings affect the appearance of a place?", "What kinds of movies do you like best?", "How often do you go to a cinema to watch a movie?", "Did you usually go to the cinema when you were a kid?", 
            "What was the first film that you watched?", "Do you like to watch movies alone or with your friends?", "Do you like to go to the cinema with your friends?", "Do you prefer foreign films or films made in your country?"]
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
            "Some people believe that travelling has become less meaningful because modern tourists can easily access information about almost any destination. To what extent do you agree?", "Why do some people prefer to travel in their own country rather than going abroad?", 
            "Some people don't like to travel abroad. Why?", "Why do people choose to travel or live abroad?", "What food do you (people in your country) eat on special occasions?", "What is the difference between special food in your country and other countries?", 
            "Why do many people like to spend a lot of money on food on special days?", "What do you think of people using their mobile phones during a meal?", "Do you think it's good to communicate when eating with your family?", 
            "More and more people are unwilling to cook. Why is this happening?", "What do you think buildings will be like in the future?", "Which do most people prefer, living in a bungalow or in a tall building?", "Why are taller and taller building being constructed nowadays?", 
            "Why do people get up early?", "Are there any situations when it's not good to arrive early?", "Is it good to arrive early in any situation?", "Why do some people stay up late at night?", "Is it easy to get up early?", 
            "Do people in your country usually obey the law?", "What are some rules that exist in schools or workplaces in your country?", "What kind of behaviour is considered good behaviour?", "How can parents teach children to obey rules?", 
            "What are the benefits of obeying rules?", "Do you think children can learn about the law outside of school?", "Do people in your country like to grow plants?", "What are the advantages of growing plants at home?", 
            "Do people like to grow vegetables in your country?", "What are the advantages of growing vegetables at home?", "How do people feel when they eat vegetables that they grew on their own?", 
            "Do old people often change plans?", "What are the common reasons when people need to change plans?", "How would you tell your friends if you had to change your plans?", "How does technology help people make plans?", "Why do parents still make plans for their children nowadays?", 
            "What food do you eat on special occasions?", "Is food now better than in the past?", "Are there any differences between the food people eat today and the food people ate in the past?", "What is the difference between watching sports events at home and at the stadium?", 
            "What are the advantages of watching sports events online?", "Why does somebody dislike to watch the Olympic Games?", "What do you need to do before you travel?", "What preparations should people make before going on holiday?", 
            "Where do people usually travel on holidays?", "Do you think it's important to do some preparation before you travel to new places?", "Do you think children sometimes have to make important decisions?", "What important decisions do young people need to make after the completion of high school?",
            "Who can children turn to for help when making a decision?", "How do people make important decisions?", "What are the advantages of advertising?", "Do you think the influence of advertising is good?", "Do you think advertisements can influence our decisions when shopping?", 
            "Do you prefer to work in a team or own your own?", "Why do some people prefer to work on their own?", "What kinds of jobs require people to work in a team?", "What qualities do you think a good team member should have?", "Why do some people open their own business?", 
            "Is it better to have your own business than work for a boss?", "What do you need to start a business?", "Do you agree that nowadays it is easier to set up a business than in the past?", "Do people in your country like to work in big companies or small companies?",
            "What challenges and difficulties do people face when they try to have a successful small business?", "What makes some companies more successful than others?", "In your country, when people visit other people in their homes, do they usually bring a gift?", 
            "What kind of houses or apartments do people prefer to buy?", "What is the difference between living in the countryside and the city?", "Do you prefer to live in the city or in the countryside?", "Why are rivers and lakes important to local people?", "How can rivers and lakes benefit local people?", 
            "What water sports are popular in your country?", "Why do people like water sports?", "Do you think having a river or lake has an impact on tourism in the city?", ""]
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