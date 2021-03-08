const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt-inzi");
const { userModel } = require("../dbrepo/index");
const api = express.Router();
const { SERVER_SECRET } = require("../core");
// const client = process.env.POSTMARK;

// Signup
api.post("/signup", (req, res, next) => {
  // for postman
  if (!req.body.name || !req.body.email || !req.body.password) {
    res.status(403).send(`
              please send name, email, password, phone and gender in json body.
              e.g:
              {
                  "userName": "zaryab",
                  "userEmail": "zaryab@gmail.com",
                  "userPassword": "qqqq",
                 
              }`);
    return;
  }
  // it will loop through database
  userModel.findOne({ email: req.body.email }, function (err, doc) {
    if (!err && !doc) {
      bcrypt.stringToHash(req.body.password).then(function (hashedPassword) {
        var newUser = new userModel({
          name: req.body.name,
          email: req.body.email,
          password: hashedPassword,
          role: req.body.role ? req.body.role : "user",
        });
        newUser.save((err, data) => {
          if (!err) {
            res.send({
              status: 200,
              doc: data,
              message: "account created successfully",
            });
          } else {
            console.log(err);
            res.status(500).send({
              message: "user create error, " + err,
            });
          }
        });
      });
    } else if (err) {
      res.status(500).send({
        message: "db error",
      });
    } else {
      res.send({
        status: 403,
        message: "user already exist",
      });
    }
  });
});

api.post("/validateEmail", (req, res) => {
  userModel.findOne({ email: req.body.email }, (err, data) => {
    if (!err) {
      res.send({
        status: 200,
        isFound: true,
        data: data,
      });
    } else {
      res.send({
        status: 403,
        isFound: false,
      });
    }
  });
});

//   login
api.post("/login", (req, res, next) => {
  if (!req.body.email || !req.body.password) {
    res.status(403).send(`
              please send email and password in json body.
              e.g:
              {
                  "currentEmail": "zaryab@gmail.com",
                  "currentPassword": "qqqq",
              }`);
    return;
  }

  userModel.findOne({ email: req.body.email }, function (err, user) {
    if (err) {
      res.status(500).send({
        message: "an error occurred: " + JSON.stringify(err),
      });
    } else if (user) {
      // verify if current user password and database password is matched
      bcrypt
        .varifyHash(req.body.password, user.password)
        .then((isMatched) => {
          if (isMatched) {
            console.log("password matched");
            // assign a token to user on successful login
            var token = jwt.sign(
              {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
              },
              SERVER_SECRET
            );

            res.cookie("jToken", token, {
              maxAge: 86_400_000,
              httpOnly: true,
            });

            res.send({
              message: "login success",
              status: 200,
              user: {
                name: user.name,
                email: user.email,
                role: user.role,
              },
            });
          } else {
            console.log("not matched");
            res.send({
              status: 401,
              message: "incorrect password",
            });
          }
        })
        .catch((e) => {
          console.log("error: ", e);
        });
    } else {
      res.send({
        status: 403,
        message: "user not found",
      });
    }
  });
});

api.post("/logout", (req, res, next) => {
  res.cookie("jToken", "", {
    maxAge: 86_400_000,
    httpOnly: true,
  });
  res.send("logout successfully");
});

api.post("/forget-password", (req, res, next) => {
  if (!req.body.email) {
    res.status(403).send(`
            please send email in json body.
            e.g:
            {
                "email": "malikasinger@gmail.com"
              }`);
    return;
  }

  userModel.findOne({ email: req.body.email }, function (err, user) {
    if (err) {
      res.status(500).send({
        message: "an error occurred: " + JSON.stringify(err),
      });
    } else if (user) {
      const otp = Math.floor(getRandomArbitrary(11111, 99999));

      otpModel
        .create({
          email: req.body.email,
          otpCode: otp,
        })
        .then((doc) => {
          client
            .sendEmail({
              From: "zaryab_student@sysborg.com",
              To: req.body.email,
              Subject: "Reset your password",
              TextBody: `Here is your password reset code: ${otp}`,
            })
            .then((status) => {
              console.log("status: ", status);
              res.send("Email sent with otp. please check your email");
            });
        })
        .catch((err) => {
          console.log("error in creating otp: ", err);
          res.status(500).send("unexpected error ");
        });
    } else {
      res.status(403).send({
        message: "user not found",
      });
    }
  });
});

api.post("/forget-password-step-2", (req, res, next) => {
  if (!req.body.email && !req.body.otp && !req.body.newPassword) {
    res.status(403).send(`
            please send email & otp in json body.
            e.g:
            {
                "email": "malikasinger@gmail.com",
                "newPassword": "xxxxxx",
                "otp": "xxxxx"
            }`);
    return;
  }

  userModel.findOne({ email: req.body.email }, function (err, user) {
    if (err) {
      res.status(500).send({
        message: "an error occurred: " + JSON.stringify(err),
      });
    } else if (user) {
      otpModel.find({ email: req.body.email }, function (err, otpData) {
        if (err) {
          res.status(500).send({
            message: "an error occurred: " + JSON.stringify(err),
          });
        } else if (otpData) {
          otpData = otpData[otpData.length - 1];

          console.log("otpData: ", otpData);

          const now = new Date().getTime();
          const otpIat = new Date(otpData.createdOn).getTime(); // 2021-01-06T13:08:33.657+0000
          const diff = now - otpIat; // 300000 5 minute

          console.log("diff: ", diff);

          if (otpData.otpCode === req.body.otp && diff < 300000) {
            // correct otp code
            otpData.remove();

            bcrypt.stringToHash(req.body.newPassword).then(function (hash) {
              user.update({ password: hash }, {}, function (err, data) {
                res.send("password updated");
              });
            });
          } else {
            res.status(401).send({
              message: "incorrect otp",
            });
          }
        } else {
          res.status(401).send({
            message: "incorrect otp",
          });
        }
      });
    } else {
      res.status(403).send({
        message: "user not found",
      });
    }
  });
});
api.post("/logout", (req, res, next) => {
  res.cookie("jToken", "");
  res.send("logout success");
});

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

module.exports = api;
