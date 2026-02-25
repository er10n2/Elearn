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
app.use(express.urlencoded({extended:true}));
app.set('view engine', 'ejs');

app.use(session({

    secret: process.env.SESSION_SECRET || 'top-secret-key',
    resave:false,
    saveUninitialized: true,
    cookie:{maxAge:1000 * 60 * 60 * 24}

}));


app.get('/', (req,res)=>{

    res.render("index", {user:req.session.user});
})

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

app.get('/login',(req,res)=>{

    res.render("login", { user: req.session.user });
})


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
                        res.send("incorrect password");
                    }
                }
            });
        } else {
        
            res.send("user not found");
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

app.post('/create-course', async (req,res)=>{


    if(!req.session.user || req.session.user.role !== 'professor'){
        return res.status(403).send("Unauthorized: Only professors can create courses.");
    }

    const  title = req.body.title;
    const description = req.body.description;
    const professorId = req.session.user.id;


    try{

        const result = await db.query("INSERT INTO course(title, description, professor_id) values($1, $2, $3)", [title, description, professorId],);

        if(result.rowCount > 0){

            res.redirect('/');

            

        }else{
            res.send("something went wrong!");
        }

    }catch(error){
        console.log(error);
    }


})




app.get('/profile', async(req,res)=>{

    if(!req.session.user){
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const role = req.session.user.role;

    try{

        if(role === 'professor'){

            const result = await db.query("SELECT * FROM professor WHERE id = $1", [userId]);
            const professorData = result.rows[0];

            professorData.email = req.session.user.email;
            professorData.role = 'professor';

            res.render('profile', {user:professorData});




        }else{

            const result = await db.query("SELECT * FROM student WHERE id=$1",[userId]);
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



app.listen(3000, function(){
    console.log("Running on port 3000");
})