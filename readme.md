# Digital Posture Monitor
This is my digital posture monitoring app that helps you sit properly and maintain good posture while working at your computer

## What does it do?
it uses your webcam to get the camera feed and then uses Resnet50 model from tensorflow to analyse your body posture. then it uses those pointers to calculate the distance between your shoulders and head it also takes in consideration the distance between your shoulder and the orientation of both the shoulders and head then it gives you a score after evaluating these pointers

## Why I made this:
I noticed that while sitting after about 1hr at computers my posture completely changes to something you can never imagine so I really needed this type of app to help me maintain a good posture and avoid back pain in the future because I even have flatback right now

## Cool features:
- **Real time scoring** - see your posture score out of 100
- **Camera monitoring** - show skeleton tracking
- **Achievements** - achievements for good posture
- **Performance tracking** - see how fast the app is running ( bottom left corner)
- **Data export** - save your progress as json files
- **Smart adjustments** - it automatically optimizes itself
- **Breaks** - it reminds you to take breaks
- **camera selector** - you can select which camera to use if you have multiple cameras connected

## How big is it:
The AI model downloads about 2.6 MB to your browser and gets cached so it only downloads once

## How to use it:

1. open the `https://posture-monitor-eight.vercel.app/` file in your web browser
2. click "allow" when it asks for permission
3. press the "Start" button
4. sit up straight and watch your score improve

## Technical stuff:
- built with resnet50 model from TensorFlow.js for AI pose detection
- works completely in your browser so no data sent to servers
- your data stays private on your computer

## Achievements you can earn:
- **First Session** - start your first monitoring session
- **Early Bird** - use the app before 9 AM
- **Perfect Posture** - keep a 90% score for 50 minutes
- **Streak Master** - use the app 7 days in a row
- **Break Master** - take 3 breaks in one session
- **Wellness Champion** - use the app for 30 total days

## Troubleshooting:
If something doesn't work:
1. Refresh the page
2. Check that your camera isn't blocked
3. Make sure you have good lighting
4. Try a different browser

## Made with sooo much love and Efforts by Anirudh :)

