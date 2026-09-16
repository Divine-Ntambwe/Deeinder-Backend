require("dotenv").config();
const express = require("express");
const mongoDb = require("mongodb");
const app = express();
const base64 = require("base-64");
const port = process.env.port || 8000;
const uri = process.env.MONGODB_DEEINDER;
const cors = require("cors");
const supabase = require("./supabase_db.js");

const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://deeinder-frontend.vercel.app"
  }
});

io.on("connection", (socket) => {
  socket.on("join_room", (data) => {
    socket.join(data);
  });

  socket.on("send_message", (data) => {
    socket.to(data.room).emit("recieve_message", data);
  });

  socket.on("disconnect", () => {
    // console.log("User disconnected", socket.id)
  });
});

const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });
app.use("/uploads", express.static("uploads"));

app.use(cors());
app.use(express.json());

let client, db;

async function connectToMongo() {
  client = new mongoDb.MongoClient(uri, {});
  await client.connect();
  db = client.db("Deeinder");
  console.log("Connected to mongodb");
}

/* ============================================================
   MIGRATED TO SUPABASE
   ============================================================ */

//signing up - DANIELLA
app.post("/signUp", upload.single("pfp"), async (req, res) => {
  let status = 500;
  let message = "Internal server error";
  const invalid = (m) => {
    status = 400;
    message = m;
  };

  try {
    const memDetails = JSON.parse(req.body.details);
    let { fullName, username, email, password, confirmPassword, gender, dob } =
      memDetails;

    if (!req.file) {
      invalid("Please upload a profile picture");
      throw new Error("Please upload a profile picture");
    }

    const b64 = req.file.buffer.toString("base64");
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const pfpPath = await cloudinary.uploader.upload(dataURI);

    if (!email.includes("@")) {
      invalid("Invalid email");
      throw new Error("Invalid email");
    }

    const { data: isEmailExists, error: emailError } = await supabase
      .from("membersPersonalInfo")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (emailError) throw emailError;

    if (isEmailExists) {
      invalid("Email already exists please log in");
      throw new Error("Email already exists please log in");
    }

    if (
      password.match(/\d/g) == null ||
      password.match(/\D/g) == null ||
      password.match(/([\W]|_)/g) == null
    ) {
      invalid("Password should include numbers and letters and symbols");
      throw new Error("Password should include numbers and letters and symbols");
    }

    if (password !== confirmPassword) {
      invalid("passwords do not match");
      throw new Error("passwords do not match");
    }

    const { data: isUsernameExists, error: usernameError } = await supabase
      .from("membersPersonalInfo")
      .select("id")
      .eq("user_name", username)
      .maybeSingle();
    if (usernameError) throw usernameError;

    if (isUsernameExists) {
      invalid("username already taken");
      throw new Error("username already taken");
    }

    const today = new Date();
    const minDate = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate()
    );

    dob = new Date(dob);

    if (dob > minDate) {
      invalid("You need to be above 18 to use this website");
      throw new Error("You need to be above 18 to use this website");
    }

    let age = today.getFullYear() - dob.getFullYear();
    const monthDifference = today.getMonth() - dob.getMonth();
    if (
      monthDifference < 0 ||
      (monthDifference === 0 && today.getDate() < dob.getDate())
    ) {
      age--;
    }

    const encodedPassword = base64.encode(password);

    const { data: member, error: memberError } = await supabase
      .from("membersPersonalInfo")
      .insert({
        full_name: fullName,
        user_name: username,
        email: email,
        password: encodedPassword,
        gender: gender,
        dob: dob.toISOString().split("T")[0],
        age: age,
        pfp_path: pfpPath.secure_url,
        profile_status: true
      })
      .select()
      .single();
    if (memberError) throw memberError;

    const { error: profileError } = await supabase
      .from("membersProfile")
      .insert({
        user_id: member.id,
        username: username,
        relationship_intent: null,
        short_description: null,
        interests: [],
        about_me: {},
        likes: [],
        connections_count: 0,
        pics_paths: [],
        profile_status: true
      });
    if (profileError) throw profileError;

    res.status(200).json({
      message: "successfully signed up",
      email,
      username,
      gender,
      fullName
    });
  } catch (error) {
    console.error("Error signing user up", error);
    res.status(status).json({ error: message });
  }
});

//logging in - DANIELLA
app.post("/login", async (req, res) => {
  let status = 500;
  let message = "Internal server error";
  const invalid = (m) => {
    status = 400;
    message = m;
  };

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      invalid("Please enter email and password");
      throw new Error("Please enter email and password");
    }

    const { data: user, error } = await supabase
      .from("membersPersonalInfo")
      .select("id, email, password, user_name, gender, full_name, age, pfp_path")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;

    if (!user) {
      invalid("Email does not exist, please sign up");
      throw new Error("Email does not exist, please sign up");
    }

    const decodedPassword = base64.decode(user.password);
    if (decodedPassword !== password) {
      invalid("Incorrect password");
      throw new Error("Incorrect password");
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      username: user.user_name,
      gender: user.gender,
      fullName: user.full_name,
      age: user.age,
      pfpPath: user.pfp_path
    });
  } catch (error) {
    console.error("Error logging user in", error);
    res.status(status).json({ error: message });
  }
});

//getting all members profiles to display on home page - DANIELLA
app.get("/membersProfiles", async (req, res) => {
  try {
    const { data: profiles, error: profileErr } = await supabase
      .from("membersProfile")
      .select("*")
      .eq("profile_status", true);
    if (profileErr) throw profileErr;

    const { data: membersInfo, error: infoErr } = await supabase
      .from("membersPersonalInfo")
      .select("id, age, full_name, user_name, gender, pfp_path")
      .eq("profile_status", true);
    if (infoErr) throw infoErr;

    const members = membersInfo.map((info) => {
      const profile = profiles.find((p) => p.user_id === info.id) || {};
      return {
        age: info.age,
        fullName: info.full_name,
        username: info.user_name,
        gender: info.gender,
        pfpPath: info.pfp_path,
        relationshipIntent: profile.relationship_intent ?? null,
        shortDescription: profile.short_description ?? null,
        interests: profile.interests ?? [],
        aboutMe: profile.about_me ?? {},
        likes: profile.likes ?? [],
        connections: profile.connections_count ?? 0,
        picsPaths: profile.pics_paths ?? []
      };
    });

    res.status(200).json([...members]);
  } catch (error) {
    console.error("error getting all members", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//getting a single profile - DANIELLA
app.get("/memberProfile/:username", async (req, res) => {
  let status = 500;
  let message = "Internal server error";
  const invalid = () => {
    status = 400;
    message = "user does not exist";
  };

  try {
    const username = req.params.username;

    const { data: memberInfo, error: infoErr } = await supabase
      .from("membersPersonalInfo")
      .select("id, age, full_name, user_name, pfp_path")
      .eq("user_name", username)
      .maybeSingle();
    if (infoErr) throw infoErr;

    if (!memberInfo) {
      invalid();
      throw new Error("User does not exist");
    }

    const { data: profile, error: profileErr } = await supabase
      .from("membersProfile")
      .select("*")
      .eq("user_id", memberInfo.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    res.status(200).json({
      age: memberInfo.age,
      fullName: memberInfo.full_name,
      username: memberInfo.user_name,
      pfpPath: memberInfo.pfp_path,
      relationshipIntent: profile?.relationship_intent ?? null,
      shortDescription: profile?.short_description ?? null,
      interests: profile?.interests ?? [],
      aboutMe: profile?.about_me ?? {},
      likes: profile?.likes ?? [],
      connections: profile?.connections_count ?? 0,
      picsPaths: profile?.pics_paths ?? []
    });
  } catch (error) {
    console.error("Error getting profile", error);
    res.status(status).send({ message: message });
  }
});

//liking a members profile - DAVID
app.put("/likeProfile/:likerUsername/:memberUsername", async (req, res) => {
  try {
    const member = req.params.memberUsername;
    const liker = req.params.likerUsername;

    const { data: profile, error: fetchErr } = await supabase
      .from("membersProfile")
      .select("likes")
      .eq("username", member)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!profile) throw new Error("Member not found");

    const currentLikes = profile.likes || [];
    if (currentLikes.includes(liker)) {
      return res.status(200).json({ message: "Already liked" });
    }

    const { error: updateErr } = await supabase
      .from("membersProfile")
      .update({ likes: [...currentLikes, liker] })
      .eq("username", member);
    if (updateErr) throw updateErr;

    res.status(200).json({ message: "Successfully updated" });
  } catch (error) {
    console.error("Error liking profile", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//disliking a members profile - DAVID
app.put("/dislikeProfile/:likerUsername/:memberUsername", async (req, res) => {
  try {
    const member = req.params.memberUsername;
    const liker = req.params.likerUsername;

    const { data: profile, error: fetchErr } = await supabase
      .from("membersProfile")
      .select("likes")
      .eq("username", member)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!profile) throw new Error("Member not found");

    const currentLikes = profile.likes || [];
    const updatedLikes = currentLikes.filter((u) => u !== liker);

    const { error: updateErr } = await supabase
      .from("membersProfile")
      .update({ likes: updatedLikes })
      .eq("username", member);
    if (updateErr) throw updateErr;

    res.status(200).json({ message: "successfully liked profile" });
  } catch (error) {
    console.error("Error disliking profile", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//updating profile data when user wants to edit their profile - DANIELLA
app.put(
  "/UpdatemembersPersonalInfo/:username",
  upload.single("pfp"),
  async (req, res) => {
    let status = 500;
    let message = "Internal server error";
    const invalid = () => {
      status = 400;
      message = "Invalid input";
    };

    try {
      const updates = JSON.parse(req.body.updates);
      const username = req.params.username;

      if (updates.username && updates.username !== username) {
        const { data: existing, error: checkErr } = await supabase
          .from("membersProfile")
          .select("id")
          .eq("username", updates.username)
          .maybeSingle();
        if (checkErr) throw checkErr;

        if (existing) {
          invalid();
          throw new Error("Username already exists");
        }
      }

      if (req.file) {
        const b64 = req.file.buffer.toString("base64");
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;
        const pfpPath = await cloudinary.uploader.upload(dataURI);

        const { error: pfpErr } = await supabase
          .from("membersPersonalInfo")
          .update({ pfp_path: pfpPath.secure_url })
          .eq("user_name", username);
        if (pfpErr) throw pfpErr;
      }

      const fieldMap = {
        username: "username",
        relationshipIntent: "relationship_intent",
        shortDescription: "short_description",
        interests: "interests",
        aboutMe: "about_me",
        picsPaths: "pics_paths"
      };

      const profileUpdates = {};
      for (const key in updates) {
        if (fieldMap[key]) {
          profileUpdates[fieldMap[key]] = updates[key];
        }
      }

      if (Object.keys(profileUpdates).length) {
        const { error: profileErr } = await supabase
          .from("membersProfile")
          .update(profileUpdates)
          .eq("username", username);
        if (profileErr) throw profileErr;
      }

      if (updates.username && updates.username !== username) {
        const { error: usernameErr } = await supabase
          .from("membersPersonalInfo")
          .update({ user_name: updates.username })
          .eq("user_name", username);
        if (usernameErr) throw usernameErr;
      }

      res.status(200).json({ message: "successfully updated" });
    } catch (error) {
      console.error("Error updating profile", error);
      res.status(status).json({ error: message });
    }
  }
);

/* ============================================================
   STILL ON MONGODB (not yet migrated)
   ============================================================ */

//adding pictures - DAVID
app.put("/addPictures/:username", upload.single("picture"), async (req, res) => {
  try {
    const b64 = req.file.buffer.toString("base64");
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const pfpPath = await cloudinary.uploader.upload(dataURI);

    const result = await db
      .collection("membersProfile")
      .updateOne(
        { username: req.params.username },
        { $push: { picsPaths: pfpPath.secure_url } }
      );

    if (result.modifiedCount) {
      res.status(200).json({ message: "successfully updated" });
    } else {
      throw new Error("couldn't add picture");
    }
  } catch (error) {
    console.error("Error adding new pictures", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//removing pictures - DAVID
app.put("/removePicture/:username", async (req, res) => {
  try {
    const path = req.body.path;
    const result = await db
      .collection("membersProfile")
      .updateOne(
        { username: req.params.username },
        { $pull: { picsPaths: path } }
      );

    if (result.modifiedCount) {
      res.status(200).json({ message: "successfully updated" });
    } else {
      throw new Error("couldn't remove picture");
    }
  } catch (error) {
    console.error("Error removing picture", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

//creating a new connection request - NISSI
app.post(
  "/connectionRequest/:senderUsername/:recieverUsername",
  async (req, res) => {
    let status = 500;
    let message = "Internal server error";

    try {
      const senderUsername = req.params.senderUsername;
      const recieverUsername = req.params.recieverUsername;

      const result = await db.collection("connectionRequests").insertOne({
        recieverUsername,
        senderUsername,
        dateSent: new Date(),
        hasAccepted: false,
        dateAccepted: null
      });

      if (result) {
        res.status(200).json({ message: "successfully sent request" });
      } else {
        throw new Error("could not send connection request");
      }
    } catch (error) {
      console.error("Error creating connection request", error);
      res.status(status).json({ message: message });
    }
  }
);

//getting all connection requests - NISSI
app.get("/connectionRequests/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const result = await db
      .collection("connectionRequests")
      .find(
        { $or: [{ recieverUsername: username }, { senderUsername: username }] },
        { projection: { dataAccepted: 0, dateSent: 0 } }
      )
      .toArray();

    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting connection requests", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//accepting a connection request - NISSI
app.put("/acceptedConnectionRequest/:recieverUsername", async (req, res) => {
  try {
    const senderUsername = req.body.senderUsername;
    const recieverUsername = req.params.recieverUsername;

    const result = await db
      .collection("connectionRequests")
      .updateOne(
        { senderUsername, recieverUsername },
        { $set: { hasAccepted: true, dateAccepted: new Date() } }
      );

    const updated = await db
      .collection("membersProfile")
      .updateMany(
        {
          $or: [
            { username: recieverUsername },
            { username: senderUsername }
          ]
        },
        { $inc: { connections: 1 } }
      );

    if (updated.modifiedCount > 1 && result.modifiedCount) {
      res.status(200).json(result);
    } else {
      throw new Error("Error accepting connection request");
    }
  } catch (error) {
    console.error("Error accepting connection request", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//removing a connection - NISSI
app.delete("/removeConnectionRequest", async (req, res) => {
  try {
    const senderUsername = req.body.senderUsername;
    const recieverUsername = req.body.recieverUsername;

    const deletedResult = await db
      .collection("connectionRequests")
      .deleteOne({ senderUsername, recieverUsername });

    const updatedResult = await db
      .collection("membersProfile")
      .updateMany(
        {
          $or: [
            { username: recieverUsername },
            { username: senderUsername }
          ]
        },
        { $inc: { connections: -1 } }
      );

    if (deletedResult.deletedCount && updatedResult.modifiedCount) {
      res.status(200).json(deletedResult);
    } else {
      throw new Error("Error removing connection");
    }
  } catch (error) {
    console.error("Error removing connection request", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//cancelling a connection request - NISSI
app.delete("/cancelConnectionRequest", async (req, res) => {
  try {
    const senderUsername = req.body.senderUsername;
    const recieverUsername = req.body.recieverUsername;

    const deletedResult = await db
      .collection("connectionRequests")
      .deleteOne({ senderUsername, recieverUsername });

    res.status(200).json(deletedResult);
  } catch (error) {
    console.error("Error cancelling connection request", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//getting messages - DAVID
app.get("/messages/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const result = await db
      .collection("messages")
      .find({ $or: [{ recieverId: username }, { senderId: username }] })
      .toArray();

    res.json(result);
  } catch (error) {
    console.error("Error getting messages", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

//posting a new message - DAVID
app.post("/sendAMessage", async (req, res) => {
  try {
    await db.collection("messages").insertOne(req.body);
    res.status(200).json({ message: "successsfully sent" });
  } catch (error) {
    console.error("Error sending messages", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

server.listen(port, async () => {
  console.log(`Server is running on http://localhost:${port}`);
  await connectToMongo();
});