/*
   Copyright 2016 Yuki KAN

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
"use strict";

import { Operation } from "express-openapi";
import * as api from "../../../../../../api";
import Channel from "../../../../../../Channel";
import Service from "../../../../../../Service";

export const parameters = [
    {
        in: "path",
        name: "type",
        type: "string",
        enum: ["GR", "BS", "CS", "SKY"],
        required: true
    },
    {
        in: "path",
        name: "channel",
        type: "string",
        required: true
    },
    {
        in: "path",
        name: "id",
        type: "integer",
        maximum: 6553565535,
        required: true
    },
    {
        in: "header",
        name: "X-Mirakurun-Priority",
        type: "integer",
        minimum: 0
    },
    {
        in: "header",
        name: "X-Mirakurun-Delete-Pids",
        type: "string",
    },
    {
        in: "query",
        name: "decode",
        type: "integer",
        minimum: 0,
        maximum: 1
    }
];

export const get: Operation = (req, res) => {

    const channel = Channel.get(req.params.type, req.params.channel);

    if (channel === null) {
        api.responseError(res, 404);
        return;
    }

    const service = Service.findByChannel(channel).find(sv => (sv.id === req.params.id || sv.serviceId === req.params.id));

    if (!service) {
        api.responseError(res, 404);
        return;
    }

    let requestAborted = false;
    req.once("close", () => requestAborted = true);

    let deletePids = [];

    if (req.get("X-Mirakurun-Delete-Pids") !== undefined) {
        const reqDelPids = req.get("X-Mirakurun-Delete-Pids").split(",");
        for (let i = 0; i < reqDelPids.length; i++) {
            deletePids.push(parseInt(reqDelPids[i]));
        }
    }

    service.getStream({
        id: (req.ip || "unix") + ":" + (req.connection.remotePort || Date.now()),
        priority: req.get("X-Mirakurun-Priority") || 0,
        agent: req.get("User-Agent"),
        disableDecoder: (req.query.decode === 0),
        deletePids: deletePids
    })
        .then(stream => {

            if (requestAborted === true) {
                return stream.emit("close");
            }

            req.once("close", () => stream.emit("close"));

            res.setHeader("Content-Type", "video/MP2T");
            res.status(200);
            stream.pipe(res);
        })
        .catch((err) => api.responseStreamErrorHandler(res, err));
};

get.apiDoc = {
    tags: ["channels", "services", "stream"],
    operationId: "getServiceStreamByChannel",
    produces: ["video/MP2T"],
    responses: {
        200: {
            description: "OK"
        },
        404: {
            description: "Not Found"
        },
        503: {
            description: "Tuner Resource Unavailable"
        },
        default: {
            description: "Unexpected Error"
        }
    }
};