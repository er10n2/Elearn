import express from 'express';

const app = express();

app.use(express.static('public'));
app.use(express.urlencoded({extended:true}));
app.set('view engine', 'ejs');


app.get('/', (req,res)=>{

    res.render("index");
})

app.get('/register',(req,res)=>{

    res.render("register");
})


app.post('/register',(req,res)=>{

    const email = req.body.username;
    const password = req.body.password;
    const role = req.body.role;
})

app.get('/login',(req,res)=>{

    res.render("login");
})

app.listen(3000, function(){
    console.log("Running on port 3000");
})