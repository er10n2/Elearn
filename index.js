import express from 'express';
import bcrypt from "bcrypt";
import pg from 'pg';
import 'dotenv/config';

import session from 'express-session';
const app = express();

const db = new pg.Client({

    user:process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password:process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

db.connect();
const saltRounds = 10;

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.set('view engine', 'ejs');

app.use(session({

    secret: process.env.SESSION_SECRET || 'top-secret-key',
    resave:false,
    saveUninitialized: true,
    cookie:{maxAge:1000 * 60 * 60 * 24}

}));

// Async error wrapper middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};



app.get('/', async(req,res)=>{


    try{

        const result = await db.query("SELECT course.*, professor.name, professor.lastname FROM course JOIN professor ON course.professor_id = professor.id");
           
        const Allcourses = result.rows;

        if(result.rows.length ===0){
             return res.status(404).send("No course Avaliable");
        }else{
               res.render("index", {user:req.session.user,Allcourses});
        }

    }catch(error){
        console.log(error);
    }

    
});


app.get('/courses/:id', async(req,res)=>{
    if (!req.session.user) return res.redirect('/login');

    try {
        const courseId = req.params.id;
        const result = await db.query("SELECT course.*, professor.name, professor.lastname FROM course JOIN professor ON course.professor_id = professor.id WHERE course.id = $1", [courseId]);
        
        if (result.rows.length === 0) {
            return res.status(404).send("<h1>Course Not Found</h1><p>This course does not exist.</p><a href='/my-learning'>Go Back</a>");
        }

        const course = result.rows[0];
        res.render("course", { user: req.session.user, course });
    } catch (error) {
        console.log("Error fetching course:", error);
        res.status(500).send("<h1>Error Loading Course</h1><p>Something went wrong. Please try again.</p><a href='/my-learning'>Go Back</a>");
    }
});


app.post('/enroll', asyncHandler(async(req,res)=>{

    if (!req.session.user) {
        return res.status(401).json({message:"Please log in to enroll in a course."});
    }

    if(req.session.user.role !== "student"){
        return res.status(403).json({message:"You must be a student in order to enroll in a course."})
    }

    const studentId = req.session.user.id;
    const courseId = req.body.courseId;

    if (!studentId || !courseId) {
        return res.status(400).json({message:"Invalid student or course ID"});
    }

    try{
        await db.query("INSERT INTO student_enrollments(student_id, course_id) VALUES($1, $2)",[
             studentId, courseId
        ]);

        res.json({message:"Successfully enrolled in the course!"});

    }catch(error){
        if(error.code ==='23505'){
            return res.status(400).json({message:"You are already enrolled in this course."});
        }

        console.log("Enrollment error:", error);
        res.status(500).json({message:"Error during enrollment: " + error.message});
    }

}));


app.get('/my-learning', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    try {
        const studentId = req.session.user.id;

        const query = `
            SELECT course.title, course.description, course.id
            FROM student_enrollments
            JOIN course ON student_enrollments.course_id = course.id
            WHERE student_enrollments.student_id = $1
        `;

        const result = await db.query(query, [studentId]);
        
        res.render("my-learning", { 
            user: req.session.user, 
            enrolledCourses: result.rows 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error loading your courses.");
    }
});

app.get('/register',(req,res)=>{

    res.render("register");
})


app.post('/register', async (req,res)=>{

    const email = req.body.username;
    const password = req.body.password;
    const role = req.body.role;

    try{

        const checkEmailExist = await db.query("SELECT * FROM users WHERE email = $1", [email],);

        if(checkEmailExist.rows.length > 0 ){

            res.send("Email Already exists");

        }else{

            bcrypt.hash(password, saltRounds,async (err,hash)=>{
                if(err){
                    console.log("Error hashing password")

                }else{
                    const result = await db.query("INSERT INTO users(email, password, role) values ($1, $2, $3) RETURNING id",[email, hash, role]);
                    console.log(result);


                    const newUserId = result.rows[0].id;

                    if(role === 'professor'){

                        
                     await db.query ("INSERT INTO professor (id) VALUES ($1)", [
                        newUserId
                     ]);
                    }

                    else if (role ==='student'){
                        await db.query("INSERT INTO student (id) values ($1)", [newUserId]);
                    }

                    res.redirect('/login')
                }
            })
        }

    }catch(error){
        console.log(error);
    }





});



app.get('/login', (req, res) => {
    res.render("login", {
        user: req.session.user,
        error: null
    });
});

app.post("/login", async (req, res) => {
    const email = req.body.username;
    const loginPassword = req.body.password;

    try {
        const checkEmailExists = await db.query("SELECT * FROM users where email = $1", [email]);

        
        if (checkEmailExists.rows.length > 0) {

            const user = checkEmailExists.rows[0];
            const storedHashedPassword = user.password;

          
            bcrypt.compare(loginPassword, storedHashedPassword, (err, isMatch) => {
                if (err) {
                    console.log(err);
                    res.status(500).send("Error comparing passwords");
                } else {
                    if (isMatch) {
                        
                        req.session.user = user;
                        
                        res.redirect('/');
                    } else {
                     return res.render("login", {
    user: null,
    error: "Invalid email or password."
});
                    }
                }
            });
        } else {
        
           return res.render("login", {
    user: null,
    error: "Invalid email or password."
});
        }

    } catch (error) {
        console.log(error);
        res.status(500).send("Database error");
    }
});



app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log("Error logging out:", err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/');
    });
});


app.get('/dashboard', (req,res)=>{

    if(req.session.user && req.session.user.role === 'professor'){

        res.render('dashboard', {user:req.session.user});
    }else{
        res.redirect('/login')
    }

   
});

app.post('/create-course', asyncHandler(async (req,res)=>{


    if(!req.session.user || req.session.user.role !== 'professor'){
        return res.status(403).json({message:"Unauthorized: Only professors can create courses."});
    }

    const  title = req.body.title;
    const description = req.body.description;
    const professorId = req.session.user.id;

    if (!title || !description) {
        return res.status(400).json({message:"Title and description are required"});
    }

    try{

        const result = await db.query("INSERT INTO course(title, description, professor_id) values($1, $2, $3)", [title, description, professorId],);

        if(result.rowCount > 0){

            res.json({message:"Course created successfully!"});

        }else{
            res.status(400).json({message:"Something went wrong!"});
        }

    }catch(error){
        console.log("Error creating course:", error);
        res.status(500).json({message:"Error creating course: " + error.message});
    }


}))




app.get('/profile', async(req,res)=>{

    if(!req.session.user){
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const role = req.session.user.role;

    try{

        if(role === 'professor'){

            const result = await db.query("SELECT * FROM professor WHERE id = $1", [userId]);
            
            if (!result.rows[0]) {
                console.log("Professor record not found for id:", userId);
                return res.status(404).send("Professor profile not found. Please contact support.");
            }
            
            const professorData = result.rows[0];

            professorData.email = req.session.user.email;
            professorData.role = 'professor';

            res.render('profile', {user:professorData});




        }else{

            const result = await db.query("SELECT * FROM student WHERE id=$1",[userId]);
            
            if (!result.rows[0]) {
                console.log("Student record not found for id:", userId);
                return res.status(404).send("Student profile not found. Please contact support.");
            }
            
            const studentData = result.rows[0];

            studentData.email = req.session.user.email;
            studentData.role='student';

            res.render('profile',{user:studentData});
        }
        




    }catch(error){
       console.log("Error loading profile:", error);
        res.send("Could not load profile.");


    }
 
})





app.post('/update-profile', asyncHandler(async(req,res)=>{

    if(!req.session.user){
        return res.status(401).json({message:"Please log in to update your profile."});
    }

    const name = req.body.firstName;
    const lastname = req.body.lastName;
    const email = req.body.email;
    const department = req.body.department;
    const major = req.body.major;

    const userId = req.session.user.id;
    const role = req.session.user.role;

    if (!name || !lastname || !email || !userId || !role) {
        return res.status(400).json({message:"Missing required fields"});
    }

    try{
        await db.query("UPDATE users SET email =$1 WHERE id = $2", [email, userId]);

        if(role === 'professor'){
            await db.query("UPDATE professor SET name = $1, lastname = $2, department=$3 WHERE id=$4",[
                name, lastname, department, userId
            ]);
        }else{
            await db.query(
                "UPDATE student SET name = $1, lastname= $2, major= $3 WHERE id= $4",[
                    name, lastname,major, userId
                ]
            );
        }

        req.session.user.email = email;
        req.session.user.name = name;
        req.session.user.lastname = lastname;

        if(role==='professor'){
            req.session.user.department = department;
        }else{
            req.session.user.major = major;
        }

        res.json({message:"Profile updated successfully!"});

    }catch(error){
        console.log("Error updating profile:", error);
        console.log("User ID:", userId);
        console.log("Role:", role);
        res.status(500).json({message:"Error updating your profile: " + error.message});
    }

}));



app.post('/update-password', asyncHandler(async(req, res)=>{

    if(!req.session.user){
       return res.status(401).json({message:"Please log in to update your password."});
    }

    const currentPass = req.body.currentPassword;
    const newPass = req.body.newPassword;
    const confirmPass = req.body.confirmPassword;

    const userEmail = req.session.user.email;
    const userId = req.session.user.id;

    if(newPass !== confirmPass){
       return res.status(400).json({message:"New Password and Confirm Password do not match!"});
    }

    try{
        const result = await db.query("SELECT * FROM users WHERE email =$1 AND id=$2",[userEmail,userId]);

        if(result.rows.length > 0){
            const userToupdate = result.rows[0];
            const hashedPassStoredInDb = userToupdate.password;

            bcrypt.compare(currentPass, hashedPassStoredInDb, async (err, isMatch)=>{
                try {
                    if(err){
                        console.log(err);
                        return res.status(500).json({message:"Error comparing passwords"});
                    }
                    
                    if(!isMatch){
                        return res.status(400).json({message:"Current Password is incorrect!"});
                    }

                    bcrypt.hash(newPass, saltRounds, async (err, hash)=>{
                        try {
                            if(err){
                                console.log("error hashing password:", err);
                                return res.status(500).json({message:"Error hashing password"});
                            }
                            
                            await db.query("UPDATE users SET password = $1 WHERE id = $2",[hash, userId]);
                            res.json({message:"Password updated successfully!"});
                        } catch(error) {
                            console.log("Error in hash callback:", error);
                            if (!res.headersSent) {
                                res.status(500).json({message:"Error updating password: " + error.message});
                            }
                        }
                    })
                } catch(error) {
                    console.log("Error in bcrypt.compare:", error);
                    if (!res.headersSent) {
                        res.status(500).json({message:"Error: " + error.message});
                    }
                }
            })

        }else{
            return res.status(404).json({message:"User not found!"});
        }

    }catch(error){
        console.log("Error in update-password:", error);
        if (!res.headersSent) {
            res.status(500).json({message:"Server error: " + error.message});
        }
    }

}))




// Global error handler - catches any unhandled errors
app.use((error, req, res, next) => {
    console.error("Unhandled error:", error);
    
    // If response headers already sent, can't send error response
    if (res.headersSent) {
        return;
    }
    
    // For API requests, return JSON
    if (req.path.startsWith('/enroll') || req.path.startsWith('/update-profile') || req.path.startsWith('/update-password') || req.path.startsWith('/create-course')) {
        return res.status(500).json({message: "Server error: " + error.message});
    }
    
    // For page requests, send error page
    res.status(500).send("Server error: " + error.message);
});


app.listen(3000, function(){
    console.log("Running on port 3000");
})