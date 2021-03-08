const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const path = require("path");
const cookieParser = require("cookie-parser");
const app = express();
const server = http.createServer(app);
const authRoutes = require("./routes/auth");
const jwt = require("jsonwebtoken");
const { SERVER_SECRET } = require("./core/index");
const { userModel, orderModel, productModel } = require("./dbrepo/index");

app.use(bodyParser.json());
app.use(morgan("dev"));

app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin: http://localhost:3000");
  res.header("Access-Control-Allow-Credentials: true");
  res.header("Access-Control-Allow-Methods: GET, POST");
  res.header("Access-Control-Allow-Headers: Content-Type, *");
  next();
});

app.use("/", express.static(path.resolve(path.join(__dirname, "./web/build"))));

app.use("/auth", authRoutes);

// middleware;
app.use(function (req, res, next) {
  console.log("req.cookies: ", req.cookies);
  if (!req.cookies.jToken) {
    res.status(401).send("include http-only credentials with every request");
    return;
  }
  jwt.verify(req.cookies.jToken, SERVER_SECRET, function (err, decodedData) {
    if (!err) {
      const issueDate = decodedData.iat * 1000; //it converts milliseconds to seconds
      const nowDate = new Date().getTime();
      const diff = nowDate - issueDate; // 86,400,00 milliseconds = 24 hrs

      // token will expire after 1 min
      if (diff > 3000000) {
        res.status(401).send("token expired");
      } else {
        // issue new token
        var token = jwt.sign(
          {
            id: decodedData.id,
            name: decodedData.name,
            email: decodedData.email,
            role: decodedData.role,
          },
          SERVER_SECRET
        );
        res.cookie("jToken", token, {
          maxAge: 86_400_000,
          httpOnly: true,
        });
        req.body.jToken = decodedData;
        req.headers.jToken = decodedData;
        next();
      }
    } else {
      res.status(401).send("invalid token");
    }
  });
});

app.get("/profile", (req, res, next) => {
  console.log("dashboard body", req.body);
  console.log("dashboard body", req.body.jToken.id);

  userModel.findById(
    req.body.jToken.id,
    "email name role",
    function (err, data) {
      if (!err) {
        res.send({
          status: 200,
          userData: data,
        });
      } else {
        res.status(500).send({
          message: "server error",
        });
      }
    }
  );
});

app.post("/placeorder", (req, res) => {
  console.log(req.body.order);
  if (!req.body.order) {
    res.status(403).send(`
              please send order in array in json body.`);
    return;
  }

  userModel.findById(req.body.jToken.id, "email name", (err, user) => {
    if (!err) {
      console.log("order user", user);

      orderModel
        .create({
          orderDetails: req.body.order,
          orderTotal: req.body.total,
          name: user.name,
          email: user.email,
          phone: req.body.phone,
          address: req.body.address,
          remarks: req.body.remarks,
        })
        .then((data) => {
          console.log("order placed", data);
          res.send({
            message: "your order has been placed",
            // yourOrder: data.orderDetails,
            // amount:data.orderTotal,
            // name:user.name,
            // email:user.email,
            // phone:req.body.phone,
            // address:req.body.address,
            // remarks:req.body.remarks
            data: data,
          });
        })
        .catch((err) => res.status(500).send("an error occurred" + err));
    } else {
      res.status(500).send("db error");
    }
  });
});
app.get("/orders", (req, res) => {
  userModel.findById(
    req.body.jToken.id,
    "email name role",
    function (err, data) {
      if (!err) {
        orderModel.find((err, orders) => {
          if (!err) {
            res.send({
              status: 200,
              orders: orders,
              // orderTotal:orders.orderTotal
            });
          } else {
            res.status(401).send("no orders");
          }
        });
      } else {
        res.status(500).send({
          message: "server error",
        });
      }
    }
  );
});

app.get("/myorders", (req, res) => {
  console.log(req.body);
  orderModel.find({ email: req.body.jToken.email }, (err, data) => {
    if (!err) {
      res.send({
        userOrders: data,
      });
    } else {
      res.send({
        message: "no orders",
      });
    }
  });
});

app.get("/Products", (req, res) => {
  userModel.findById(req.body.jToken.id, "email name", function (err, data) {
    if (!err) {
      productModel.find((err, products) => {
        if (!err) {
          res.send({
            status: 200,
            products: products,
            // orderTotal:orders.orderTotal
          });
        } else {
          res.status(401).send("no products");
        }
      });
    } else {
      res.status(500).send({
        message: "server error",
      });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("server is running on: ", PORT);
});
