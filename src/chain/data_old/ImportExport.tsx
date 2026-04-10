import LZString from "lz-string";
import Chain from "./Chain";
import importV1Chain from "./ImportV1";
import { Action } from "./DataManager";
import { PurchaseType } from "./Purchase";
import Jump from "./Jump";
import { GID, Id } from "./Types";


export function exportChainFragment(fragment: any) {
    return JSON.stringify(fragment, (
        (key, value) =>
        (key == "chain" ? undefined :
            value instanceof Set ? [...value] :
                value
        )));
}

export function importChain(rawObject: any) {
    if (rawObject[1] && rawObject[1].VersionNumber == "1.0")
        return importV1Chain(rawObject[1], Number(rawObject[0] + 1));
    let chain = (new Chain()).deserialize(rawObject);

    let jumpsCorrupted = false;
    chain.jumpList = chain.jumpList.filter((id) => {
        let c = !chain.requestJump(id);
        jumpsCorrupted = c || jumpsCorrupted;
        return !c;
    });

    if (jumpsCorrupted)
        chain.pushUpdate({
            dataField: ["jumpList"],
            action: Action.Update
        });


    for (let jump of Object.values(chain.jumps)) {
        //     jump.characters.forEach( (charId) => {
        //         Object.keys(chain.supplements).map(Number).forEach( (suppId)=>
        //         {
        //             if (!jump.supplementPurchases[charId][suppId]) jump.supplementPurchases[charId][suppId] = ;
        //             jump.supplementPurchases[charId][suppId] = jump.supplementPurchases[charId][suppId].filter( (id) => chain.requestPurchase(id)?.type == PurchaseType.Supplement)
        //             // console.log(jump.supplementPurchases[charId][suppId] );
        //         } )
        //  } )
        jump.characters.forEach((cId) => {
            let editedPurchases = false;
            (jump as Jump).purchases[cId] = (jump as Jump).purchases[cId].filter(pId => {
                let corrupted = !chain.requestPurchase(pId);
                editedPurchases = editedPurchases || corrupted;
                return !corrupted
            });
            if (editedPurchases) {
                chain.pushUpdate({
                    dataField: ["jumps", Number(jump.id), "purchases", Number(cId)],
                    action: Action.Update
                });
            }

            let editedDrawbacks = false;
            (jump as Jump).drawbacks[cId] = (jump as Jump).drawbacks[cId].filter(pId => {
                let corrupted = !chain.requestPurchase(pId);
                editedDrawbacks ||= corrupted;
                return !corrupted
            });
            if (editedDrawbacks)
                chain.pushUpdate({
                    dataField: ["jumps", jump.id, "drawbacks", cId],
                    action: Action.Update
                });
        });
        if (Object.keys(jump.supplementPurchases).length == 0) {
            jump.supplementPurchases = {};
            jump.characters.forEach((id) => jump.supplementPurchases[id] = Object.fromEntries(Object.keys(chain.supplements).map(id2 => [id2, []])));
            chain.pushUpdate({
                dataField: ["jumps", jump.id, "supplementPurchases"],
                action: Action.New
            });
        }
    }

    for (let pId in chain.purchases) {
        if (Number(pId) != chain.purchases[pId]._id) {
            chain.purchases[pId]._id = Number(pId);
            chain.pushUpdate({
                dataField: ["purchases", pId, "_id"],
                action: Action.Update
            });
        }
    }
    return chain;
}
